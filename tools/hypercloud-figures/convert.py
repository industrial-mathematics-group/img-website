# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""Converts the HyperCloud figures of the manuscript (PDEStudio exports, PNG) into the web images of
/explore/hypercloud/: a display image (at most 1400 px wide) and a large one (at most 2400 px wide), both WebP.

    uv run tools/hypercloud-figures/convert.py <folder with the PNG exports>

The exports used for the page are listed in FIGURES; the output goes to public/hypercloud/.
"""
import sys
from pathlib import Path

from PIL import Image

FIGURES = {
    "riemann2d": "clainshock_heatmap_full.png",
    "riemann2d-zoom": "clainshock_contourcmap_zoom.png",
    "dmr": "dmr_heatmap_full/dmr_heatmap_full.png",
    "dmr-zoom": "dmr_contourcmap_zoom/dmr_contourcmap_zoom.png",
    "mach3-step": "mach3step_heatmap_full/mach3step_heatmap_full.png",
    "sod": "euler_sod_components/euler_sod_components.png",
    "convergence-advection": "advection_conv_radius/advection_conv_radius.png",
    "convergence-burgers": "burgers_conv_radius/burgers_conv_radius.png",
    "mass-defect-epd2": "shock_mass_defect_epd2/shock_mass_defect_epd2.png",
}
SIZES = {"": 1400, "-large": 2400}

source = Path(sys.argv[1])
out = Path(__file__).resolve().parents[2] / "public" / "hypercloud"
out.mkdir(parents=True, exist_ok=True)
for name, file in FIGURES.items():
    image = Image.open(source / file).convert("RGB")
    for suffix, width in SIZES.items():
        scaled = image if image.width <= width else image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
        path = out / f"{name}{suffix}.webp"
        scaled.save(path, "WEBP", quality=88, method=6)
        print(f"{path.name:32} {scaled.width:5} x {scaled.height:5}  {path.stat().st_size / 1024:7.1f} KiB")
