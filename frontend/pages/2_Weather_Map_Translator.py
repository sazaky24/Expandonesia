"""
Streamlit page: Weather Map Translator.

Uploads a weather map image to the backend /translate-map endpoint, which
erases the Indonesian legend and writes the translated English text with the
requested month/year, then shows a before/after preview with a download button.
"""

from __future__ import annotations

import os

import requests
import streamlit as st

DEFAULT_API_URL = "http://localhost:8000"
IMAGE_TYPES = ["jpg", "jpeg", "png", "bmp", "webp"]
MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
          "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]

st.set_page_config(page_title="Weather Map Translator", page_icon="🌦️", layout="wide")

st.title("🌦️ Weather Map Translator")
st.caption(
    "Upload a precipitation analysis map, pick the target month and year, and "
    "download the translated legend (JANUARI→JANUARY, RENDAH→LOW, etc.)."
)

api_url = os.environ.get("API_URL", DEFAULT_API_URL).rstrip("/")


def _translate_map(uploaded, month: str, year: str) -> tuple[bool, bytes | None, str]:
    """POST the image to the backend /translate-map endpoint."""
    try:
        resp = requests.post(
            f"{api_url}/translate-map",
            files={"file": (uploaded.name, uploaded.getvalue())},
            data={"target_month": month, "target_year": year},
            timeout=120,
        )
    except requests.RequestException as exc:
        return False, None, f"Could not reach the backend ({exc})"

    if resp.ok:
        return True, resp.content, ""
    return False, None, f"Backend error {resp.status_code}: {resp.text}"


uploaded = st.file_uploader("Upload weather map image", type=IMAGE_TYPES)

if uploaded is not None:
    col_month, col_year, col_btn = st.columns([2, 1, 1])
    with col_month:
        target_month = st.selectbox("Target month", MONTHS, index=0)
    with col_year:
        target_year = st.text_input("Target year", value="2026")
    with col_btn:
        st.write("")  # vertical spacer
        run = st.button("🌍 Translate map", type="primary", use_container_width=True)

    st.subheader("Original")
    st.image(uploaded.getvalue(), use_container_width=True)

    if run:
        if not target_year.strip().isdigit():
            st.error("Target year must be a number, e.g. 2026.")
        else:
            with st.spinner("Translating map…"):
                ok, payload, err = _translate_map(uploaded, target_month, target_year.strip())

            if ok:
                st.subheader("Translated result")
                st.image(payload, use_container_width=True)
                st.download_button(
                    "⬇️ Download translated map (JPEG)",
                    data=payload,
                    file_name=f"map_{target_month.lower()}_{target_year}.jpg",
                    mime="image/jpeg",
                )
            else:
                st.error(err)
else:
    st.info("Waiting for an image upload…")
