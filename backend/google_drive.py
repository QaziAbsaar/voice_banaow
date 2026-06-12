"""
Google Drive integration — OAuth, upload, scan, download.

Token stored in token.pickle (per-instance). Refresh handled automatically.
"""
import io
import os
import pickle
import logging
from pathlib import Path

from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

logger = logging.getLogger("voiceforge.drive")

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_FILE = Path(__file__).parent / "token.pickle"
VOICEFORGE_ROOT = "VoiceForge"


# ── OAuth ───────────────────────────────────────────────────────────────

def _make_client_config(redirect_uri: str) -> dict:
    """Build client config from env vars."""
    return {
        "web": {
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


def _make_flow(redirect_uri: str) -> Flow:
    return Flow.from_client_config(
        _make_client_config(redirect_uri), scopes=SCOPES, redirect_uri=redirect_uri
    )


def get_auth_url(redirect_uri: str) -> str:
    """Return Google OAuth consent-page URL."""
    flow = _make_flow(redirect_uri)
    url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return url


def handle_callback(code: str, redirect_uri: str) -> bool:
    """Exchange auth code for tokens and persist them."""
    flow = _make_flow(redirect_uri)
    flow.fetch_token(code=code)
    with open(TOKEN_FILE, "wb") as f:
        pickle.dump(flow.credentials, f)
    logger.info("Drive OAuth token saved")
    return True


# ── Service ──────────────────────────────────────────────────────────────

def get_service():
    """Return authenticated Drive v3 service, or None."""
    if not TOKEN_FILE.exists():
        return None

    with open(TOKEN_FILE, "rb") as f:
        creds = pickle.load(f)

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, "wb") as f:
                pickle.dump(creds, f)
        else:
            return None

    return build("drive", "v3", credentials=creds)


def is_authenticated() -> bool:
    """Quick check — do we have a usable token?"""
    return get_service() is not None


def revoke_auth():
    """Remove stored token (used for sign-out)."""
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
        return True
    return False


# ── Drive operations ────────────────────────────────────────────────────

def _require_service():
    """Return authenticated service or raise."""
    svc = get_service()
    if svc is None:
        raise RuntimeError("Google Drive not authenticated. Run auth flow first.")
    return svc


def _ensure_folder(service, name: str, parent_id: str | None = None) -> str:
    """Find or create a folder by name. Returns folder id."""
    query = (
        f"name='{name}' and mimeType='application/vnd.google-apps.folder'"
        f" and trashed=false"
    )
    if parent_id:
        query += f" and '{parent_id}' in parents"

    results = (
        service.files()
        .list(q=query, spaces="drive", fields="files(id, name)")
        .execute()
    )
    folders = results.get("files", [])
    if folders:
        return folders[0]["id"]

    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        meta["parents"] = [parent_id]
    folder = service.files().create(body=meta, fields="id").execute()
    return folder["id"]


def get_voiceforge_root() -> str:
    """Return VoiceForge root folder id (create if missing)."""
    svc = _require_service()
    return _ensure_folder(svc, VOICEFORGE_ROOT)


def get_model_folder(model_name: str) -> str:
    """Return model's Drive folder id under VoiceForge/."""
    svc = get_service()
    root_id = get_voiceforge_root()
    return _ensure_folder(svc, model_name, parent_id=root_id)


def upload_file(local_path: str, folder_id: str) -> dict:
    """Upload a local file to the given Drive folder. Returns file metadata."""
    svc = _require_service()
    file_name = os.path.basename(local_path)
    media = MediaFileUpload(local_path, resumable=True)
    meta = {"name": file_name, "parents": [folder_id]}

    uploaded = (
        svc.files()
        .create(body=meta, media_body=media, fields="id, name, size, mimeType")
        .execute()
    )
    logger.info(
        "Uploaded %s to Drive (folder %s): id=%s, size=%s",
        file_name,
        folder_id,
        uploaded["id"],
        uploaded.get("size", "?"),
    )
    return uploaded


def scan_model_folder(model_name: str) -> dict:
    """
    Scan Drive VoiceForge/{model_name}/ for .pth and .index files.

    Returns { "pth": {id, name, size, modifiedTime} | None,
              "index": {id, name, size, modifiedTime} | None }
    """
    svc = _require_service()
    root_id = get_voiceforge_root()
    model_folder_id = _ensure_folder(svc, model_name, parent_id=root_id)

    results = (
        svc.files()
        .list(
            q=f"'{model_folder_id}' in parents and trashed=false",
            fields="files(id, name, size, modifiedTime)",
        )
        .execute()
    )
    files = results.get("files", [])

    pth = next((f for f in files if f["name"].endswith(".pth")), None)
    idx = next((f for f in files if f["name"].endswith(".index")), None)
    return {"pth": pth, "index": idx}


def download_file(file_id: str, dest_path: str) -> str:
    """Download a Drive file to local disk. Returns dest_path."""
    svc = _require_service()
    request = svc.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    with open(dest_path, "wb") as f:
        f.write(buf.getvalue())
    logger.info("Downloaded Drive file %s -> %s", file_id, dest_path)
    return dest_path
