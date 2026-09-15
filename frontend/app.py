"""
Streamlit frontend for the Excel Matrix Unpivoter.

Provides a file uploader, POSTs the workbook to the FastAPI backend, and
offers a download button for the transformed .xlsx. The API URL is read
from the ``API_URL`` environment variable (set in docker-compose.yml) so the
same code works locally and in Docker without modification.
"""

from __future__ import annotations

import io
import os

import requests
import streamlit as st

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DEFAULT_API_URL = "http://localhost:8000"

st.set_page_config(
    page_title="Excel Matrix Unpivoter",
    page_icon="📊",
    layout="centered",
)

st.title("📊 Excel Matrix Unpivoter")
st.caption(
    "Upload a cross-tabulated (pivot) .xlsx — Country in row 0, Port in row 1, "
    "with an optional Berat/Nilai measure row — and download a flat relational "
    "table with columns: **Kode, Produk, Negara, Pelabuhan, Berat, Nilai**."
)

api_url = os.environ.get("API_URL", DEFAULT_API_URL).rstrip("/")


@st.cache_data(show_spinner=False)
def _health_check(url: str) -> bool:
    """Non-blocking liveness probe of the backend, cached for 60s."""
    try:
        resp = requests.get(f"{url}/health", timeout=3)
        return resp.ok and resp.json().get("status") == "ok"
    except requests.RequestException:
        return False


def _transform(uploaded) -> tuple[bool, bytes | None, str]:
    """
    Call the backend transform endpoint.
    Returns (success, payload_bytes, error_message).
    """
    try:
        resp = requests.post(
            f"{api_url}/transform",
            files={"file": (uploaded.name, uploaded.getvalue(), XLSX_MEDIA_TYPE)},
            timeout=120,
        )
    except requests.RequestException as exc:  # network / connection failure
        return False, None, f"Could not reach the backend ({exc})"

    if resp.ok:
        return True, resp.content, ""
    return False, None, f"Backend error {resp.status_code}: {resp.text}"


# ---------------------------------------------------------------- UI ------- #

if not _health_check(api_url):
    st.error(f"⚠️ Backend is not reachable at `{api_url}/health`. Is the API running?")
    st.stop()

uploaded = st.file_uploader("Choose an Excel workbook", type=["xlsx", "xls"])

if uploaded is not None:
    st.info(f"File received: **{uploaded.name}** ({len(uploaded.getvalue()):,} bytes)")

    if st.button("🚀 Transform to flat table", type="primary"):
        with st.spinner("Unpivoting…"):
            ok, payload, err = _transform(uploaded)

        if not ok:
            st.error(err)
        else:
            st.success("Transformation complete.")

            # Friendly in-memory size hint for the download label.
            size_kb = max(1, int(len(payload) / 1024))
            st.download_button(
                label="⬇️ Download transformed.xlsx",
                data=io.BytesIO(payload),
                file_name="transformed.xlsx",
                mime=XLSX_MEDIA_TYPE,
            )
            st.caption(f"Output workbook is ~{size_kb} KB and contains the columns "
                       "Kode, Produk, Negara, Pelabuhan, Berat, Nilai.")

st.divider()
st.markdown(
    "**How it works:** the backend reads the workbook fully in memory "
    "(`io.BytesIO`), forward-fills the Country header row, melts the value "
    "columns, and streams the result back — **no file is ever saved to disk**."
)