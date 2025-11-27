"""
Diabetes Care API

Analyzes diabetes care quality across England using Public Health England Fingertips data.

Run with:
    uvicorn api:app --reload

Docs at:
    http://localhost:8000/docs
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum
import fingertips_py as ftp
import pandas as pd
import geopandas as gpd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy import stats
import io
import base64


# =============================================================================
# App Setup
# =============================================================================

app = FastAPI(
    title="Diabetes Care API",
    description="""
Analyze diabetes care quality across NHS regions in England.

## Available Indicators

| ID | Measure |
|----|---------|
| 94146 | Type 1 - All 9 care processes |
| 94147 | Type 2 - All 9 care processes |
| 94148 | Type 1 - Retinal screening |
| 94149 | Type 2 - Retinal screening |
| 94150 | Type 1 - All 3 treatment targets |
| 94151 | Type 2 - All 3 treatment targets |
| 94152 | Type 1 - Statin prescription |
| 94153 | Type 2 - Statin prescription |

## Area Types
- `England` - National level
- `ICBs` - Integrated Care Boards (42 regions)
- `ICB sub-locations` - Sub-regions
- `GPs` - Individual GP practices
    """,
    version="1.0.0"
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Enums & Models
# =============================================================================

class IndicatorID(int, Enum):
    """Available diabetes indicators"""
    TYPE1_9_CARE_PROCESSES = 94146
    TYPE2_9_CARE_PROCESSES = 94147
    TYPE1_RETINAL_SCREENING = 94148
    TYPE2_RETINAL_SCREENING = 94149
    TYPE1_TREATMENT_TARGETS = 94150
    TYPE2_TREATMENT_TARGETS = 94151
    TYPE1_STATIN_PRESCRIPTION = 94152
    TYPE2_STATIN_PRESCRIPTION = 94153


class AreaType(str, Enum):
    """Geographic area types"""
    ENGLAND = "England"
    ICBS = "ICBs"
    ICB_SUB_LOCATIONS = "ICB sub-locations"
    GPS = "GPs"


class ColorMap(str, Enum):
    """Color schemes for maps"""
    RdYlGn = "RdYlGn"
    Blues = "Blues"
    Greens = "Greens"
    Reds = "Reds"
    viridis = "viridis"
    coolwarm = "coolwarm"
    plasma = "plasma"


INDICATOR_INFO = {
    94146: {"name": "Type 1 - All 9 care processes", "description": "% receiving all annual checks"},
    94147: {"name": "Type 2 - All 9 care processes", "description": "% receiving all annual checks"},
    94148: {"name": "Type 1 - Retinal screening", "description": "% getting eye exams (prevents blindness)"},
    94149: {"name": "Type 2 - Retinal screening", "description": "% getting eye exams"},
    94150: {"name": "Type 1 - All 3 treatment targets", "description": "% with HbA1c, BP & cholesterol under control"},
    94151: {"name": "Type 2 - All 3 treatment targets", "description": "% with HbA1c, BP & cholesterol under control"},
    94152: {"name": "Type 1 - Statin prescription", "description": "% prescribed statins for heart disease prevention"},
    94153: {"name": "Type 2 - Statin prescription", "description": "% prescribed statins for heart disease prevention"},
}

# ICB boundaries URL
BOUNDARIES_URL = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Integrated_Care_Boards_April_2023_EN_BGC/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"

# Cache
_cache = {}


# =============================================================================
# Helper Functions
# =============================================================================

def get_indicator_data(indicator_id: int) -> pd.DataFrame:
    """Fetch indicator data from Fingertips API (cached)"""
    cache_key = f"indicator_{indicator_id}"
    if cache_key not in _cache:
        _cache[cache_key] = ftp.get_data_for_indicator_at_all_available_geographies(indicator_id)
    return _cache[cache_key]


def get_boundaries() -> gpd.GeoDataFrame:
    """Fetch ICB geographic boundaries (cached)"""
    if "boundaries" not in _cache:
        _cache["boundaries"] = gpd.read_file(BOUNDARIES_URL)
    return _cache["boundaries"]


def filter_data(
    indicator_id: int,
    area_type: str,
    time_period: Optional[str] = None
) -> pd.DataFrame:
    """Filter indicator data by area type and time period"""
    data = get_indicator_data(indicator_id)
    df = data[data['Area Type'] == area_type].copy()

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for area type '{area_type}'")

    if time_period is None:
        time_period = df['Time period'].max()

    df = df[df['Time period'] == time_period].copy()

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for time period '{time_period}'")

    return df, time_period


# =============================================================================
# Endpoints
# =============================================================================

@app.get("/", tags=["Info"])
def root():
    """API info and available endpoints"""
    return {
        "name": "Diabetes Care API",
        "docs": "/docs",
        "endpoints": ["/indicators", "/data", "/summary", "/rankings", "/correlation", "/map", "/chart"]
    }


@app.get("/indicators", tags=["Reference"])
def list_indicators():
    """List all available diabetes indicators"""
    return [
        {"id": k, "name": v["name"], "description": v["description"]}
        for k, v in INDICATOR_INFO.items()
    ]


@app.get("/time-periods", tags=["Reference"])
def list_time_periods(
    indicator_id: IndicatorID = Query(IndicatorID.TYPE1_9_CARE_PROCESSES, description="Indicator ID"),
    area_type: AreaType = Query(AreaType.ICBS, description="Area type")
):
    """List available time periods for an indicator"""
    data = get_indicator_data(indicator_id.value)
    df = data[data['Area Type'] == area_type.value]
    periods = sorted(df['Time period'].unique().tolist(), reverse=True)
    return {"time_periods": periods, "latest": periods[0] if periods else None}


@app.get("/data", tags=["Data"])
def get_data(
    indicator_id: IndicatorID = Query(IndicatorID.TYPE1_9_CARE_PROCESSES, description="Indicator ID"),
    area_type: AreaType = Query(AreaType.ICBS, description="Area type"),
    time_period: Optional[str] = Query(None, description="Time period (e.g. '2023/24'). Defaults to latest."),
    area_name_contains: Optional[str] = Query(None, description="Filter by area name (case-insensitive)"),
    min_value: Optional[float] = Query(None, ge=0, le=100, description="Minimum value filter"),
    max_value: Optional[float] = Query(None, ge=0, le=100, description="Maximum value filter"),
    limit: Optional[int] = Query(None, ge=1, le=10000, description="Limit results")
):
    """
    Get diabetes indicator data with filtering options.

    Returns raw data for the selected indicator, area type, and time period.
    """
    df, period = filter_data(indicator_id.value, area_type.value, time_period)

    if area_name_contains:
        df = df[df['Area Name'].str.contains(area_name_contains, case=False, na=False)]

    if min_value is not None:
        df = df[df['Value'] >= min_value]

    if max_value is not None:
        df = df[df['Value'] <= max_value]

    df = df.sort_values('Value', ascending=False)

    if limit:
        df = df.head(limit)

    records = df.apply(lambda row: {
        "area_code": row['Area Code'],
        "area_name": row['Area Name'],
        "value": round(row['Value'], 2) if pd.notna(row['Value']) else None,
        "count": int(row['Count']) if pd.notna(row['Count']) else None,
        "denominator": int(row['Denominator']) if pd.notna(row['Denominator']) else None,
    }, axis=1).tolist()

    return {
        "indicator": INDICATOR_INFO[indicator_id.value],
        "area_type": area_type.value,
        "time_period": period,
        "count": len(records),
        "data": records
    }


@app.get("/summary", tags=["Analysis"])
def get_summary(
    indicator_id: IndicatorID = Query(IndicatorID.TYPE1_9_CARE_PROCESSES, description="Indicator ID"),
    area_type: AreaType = Query(AreaType.ICBS, description="Area type"),
    time_period: Optional[str] = Query(None, description="Time period. Defaults to latest.")
):
    """
    Get statistical summary of indicator values.

    Returns mean, std, min, max, and percentiles.
    """
    df, period = filter_data(indicator_id.value, area_type.value, time_period)
    values = df['Value'].dropna()

    return {
        "indicator": INDICATOR_INFO[indicator_id.value],
        "area_type": area_type.value,
        "time_period": period,
        "areas_count": len(values),
        "total_patients": int(df['Denominator'].sum()) if 'Denominator' in df.columns else None,
        "statistics": {
            "mean": round(values.mean(), 2),
            "std": round(values.std(), 2),
            "min": round(values.min(), 2),
            "percentile_25": round(values.quantile(0.25), 2),
            "median": round(values.median(), 2),
            "percentile_75": round(values.quantile(0.75), 2),
            "max": round(values.max(), 2),
        }
    }


@app.get("/rankings", tags=["Analysis"])
def get_rankings(
    indicator_id: IndicatorID = Query(IndicatorID.TYPE1_9_CARE_PROCESSES, description="Indicator ID"),
    area_type: AreaType = Query(AreaType.ICBS, description="Area type"),
    time_period: Optional[str] = Query(None, description="Time period. Defaults to latest."),
    n: int = Query(10, ge=1, le=100, description="Number of top/bottom areas to return"),
    order: Literal["top", "bottom"] = Query("top", description="Return top or bottom performers")
):
    """
    Get top or bottom performing areas.

    Use `order=top` for best performers, `order=bottom` for worst.
    """
    df, period = filter_data(indicator_id.value, area_type.value, time_period)
    df = df.dropna(subset=['Value'])

    if order == "top":
        df = df.nlargest(n, 'Value')
    else:
        df = df.nsmallest(n, 'Value')

    rankings = []
    for rank, (_, row) in enumerate(df.iterrows(), 1):
        rankings.append({
            "rank": rank,
            "area_code": row['Area Code'],
            "area_name": row['Area Name'],
            "value": round(row['Value'], 2),
            "patient_count": int(row['Denominator']) if pd.notna(row['Denominator']) else None
        })

    return {
        "indicator": INDICATOR_INFO[indicator_id.value],
        "area_type": area_type.value,
        "time_period": period,
        "order": order,
        "rankings": rankings
    }


@app.get("/correlation", tags=["Analysis"])
def get_correlation(
    indicator_id: IndicatorID = Query(IndicatorID.TYPE1_9_CARE_PROCESSES, description="Indicator ID"),
    area_type: AreaType = Query(AreaType.ICBS, description="Area type"),
    time_period: Optional[str] = Query(None, description="Time period. Defaults to latest.")
):
    """
    Analyze correlation between population size and care quality.

    Tests whether larger areas have better or worse outcomes.
    """
    df, period = filter_data(indicator_id.value, area_type.value, time_period)

    df = df.dropna(subset=['Value', 'Denominator'])

    if len(df) < 3:
        raise HTTPException(status_code=400, detail="Insufficient data for correlation analysis")

    x = df['Denominator']
    y = df['Value']

    r, p = stats.pearsonr(x, y)

    if p >= 0.05:
        interpretation = "No significant relationship between population size and care quality."
    elif r > 0.3:
        interpretation = "Larger populations tend to have better care quality."
    elif r < -0.3:
        interpretation = "Larger populations tend to have worse care quality."
    else:
        interpretation = "Weak relationship between population size and care quality."

    return {
        "indicator": INDICATOR_INFO[indicator_id.value],
        "area_type": area_type.value,
        "time_period": period,
        "correlation": {
            "r": round(r, 4),
            "p_value": round(p, 4),
            "significant": p < 0.05,
            "interpretation": interpretation
        }
    }


@app.get("/map", tags=["Visualization"])
def generate_map(
    indicator_id: IndicatorID = Query(IndicatorID.TYPE1_9_CARE_PROCESSES, description="Indicator ID"),
    time_period: Optional[str] = Query(None, description="Time period. Defaults to latest."),
    cmap: ColorMap = Query(ColorMap.RdYlGn, description="Color scheme"),
    figsize_width: float = Query(10, ge=5, le=20, description="Figure width in inches"),
    figsize_height: float = Query(12, ge=5, le=24, description="Figure height in inches"),
    dpi: int = Query(100, ge=50, le=300, description="Resolution (DPI)"),
    title: Optional[str] = Query(None, description="Custom title"),
    format: Literal["png", "base64"] = Query("png", description="Output format")
):
    """
    Generate a choropleth map of ICB areas.

    Returns a PNG image showing geographic distribution of the indicator.
    Green = better, Red = worse (for RdYlGn colormap).
    """
    df, period = filter_data(indicator_id.value, "ICBs", time_period)
    gdf = get_boundaries()

    # Merge data with boundaries
    gdf_plot = gdf.merge(
        df[['Area Code', 'Area Name', 'Value']],
        left_on='ICB23CD',
        right_on='Area Code',
        how='left'
    )

    # Create figure
    fig, ax = plt.subplots(figsize=(figsize_width, figsize_height))

    gdf_plot.plot(
        column='Value',
        ax=ax,
        legend=True,
        legend_kwds={
            'label': f"% - {INDICATOR_INFO[indicator_id.value]['name']}",
            'orientation': 'horizontal',
            'shrink': 0.8,
            'pad': 0.02
        },
        cmap=cmap.value,
        missing_kwds={'color': 'lightgrey', 'label': 'No data'},
        edgecolor='white',
        linewidth=0.3
    )

    map_title = title or f"{INDICATOR_INFO[indicator_id.value]['name']}\nby ICB - {period}"
    ax.set_title(map_title, fontsize=14, fontweight='bold')
    ax.axis('off')

    plt.tight_layout()

    # Save to buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=dpi, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)

    if format == "base64":
        encoded = base64.b64encode(buf.getvalue()).decode('utf-8')
        return {"image": encoded, "format": "base64"}

    return StreamingResponse(buf, media_type="image/png")


@app.get("/chart", tags=["Visualization"])
def generate_chart(
    indicator_id: IndicatorID = Query(IndicatorID.TYPE1_9_CARE_PROCESSES, description="Indicator ID"),
    area_type: AreaType = Query(AreaType.ICBS, description="Area type"),
    time_period: Optional[str] = Query(None, description="Time period. Defaults to latest."),
    figsize_width: float = Query(10, ge=5, le=20, description="Figure width in inches"),
    figsize_height: float = Query(6, ge=4, le=12, description="Figure height in inches"),
    dpi: int = Query(100, ge=50, le=300, description="Resolution (DPI)"),
    point_color: str = Query("steelblue", description="Scatter point color"),
    show_regression: bool = Query(True, description="Show regression line"),
    title: Optional[str] = Query(None, description="Custom title"),
    format: Literal["png", "base64"] = Query("png", description="Output format")
):
    """
    Generate a scatter plot of population size vs care quality.

    Shows relationship between number of patients and indicator value.
    """
    df, period = filter_data(indicator_id.value, area_type.value, time_period)
    df = df.dropna(subset=['Value', 'Denominator'])

    x = df['Denominator']
    y = df['Value']

    fig, ax = plt.subplots(figsize=(figsize_width, figsize_height))

    ax.scatter(x, y, alpha=0.7, edgecolor='black', s=60, color=point_color)

    if show_regression and len(x) >= 2:
        slope, intercept, r, p, se = stats.linregress(x, y)
        ax.plot(x, slope * x + intercept, 'r--', label=f'r = {r:.3f}, p = {p:.3f}')
        ax.legend()

    ax.set_xlabel('Number of Patients')
    ax.set_ylabel('% Value')

    chart_title = title or f"{INDICATOR_INFO[indicator_id.value]['name']}\nPopulation vs Quality - {period}"
    ax.set_title(chart_title, fontsize=12, fontweight='bold')

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=dpi, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)

    if format == "base64":
        encoded = base64.b64encode(buf.getvalue()).decode('utf-8')
        return {"image": encoded, "format": "base64"}

    return StreamingResponse(buf, media_type="image/png")


@app.post("/cache/clear", tags=["Admin"])
def clear_cache():
    """Clear the data cache to fetch fresh data"""
    _cache.clear()
    return {"message": "Cache cleared"}


@app.get("/health", tags=["Admin"])
def health():
    """Health check"""
    return {"status": "ok", "cache_size": len(_cache)}
