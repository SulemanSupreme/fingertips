# Fingertips Diabetes Care Analysis

Analyze diabetes care quality across NHS regions in England using Public Health England Fingertips data.

## Features

- **API**: FastAPI backend with endpoints for data, rankings, maps, and charts
- **Web UI**: Interactive frontend to visualize diabetes care metrics
- **Jupyter Notebook**: Exploratory data analysis with geographic visualizations

## Available Indicators

| ID | Measure | Description |
|----|---------|-------------|
| 94146 | Type 1 - All 9 care processes | % receiving all annual checks |
| 94147 | Type 2 - All 9 care processes | % receiving all annual checks |
| 94148 | Type 1 - Retinal screening | % getting eye exams |
| 94149 | Type 2 - Retinal screening | % getting eye exams |
| 94150 | Type 1 - All 3 treatment targets | % with HbA1c, BP & cholesterol under control |
| 94151 | Type 2 - All 3 treatment targets | % with HbA1c, BP & cholesterol under control |
| 94152 | Type 1 - Statin prescription | % prescribed statins |
| 94153 | Type 2 - Statin prescription | % prescribed statins |

---

## Setup

### 1. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install fastapi uvicorn fingertips_py pandas geopandas matplotlib scipy jupyter ipykernel
```

---

## Running the API

Start the FastAPI server:

```bash
source venv/bin/activate
uvicorn api:app --reload
```

The API will be available at:
- **API**: http://localhost:8000
- **Docs**: http://localhost:8000/docs (Swagger UI)
- **OpenAPI**: http://localhost:8000/openapi.json

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /indicators` | List all available indicators |
| `GET /time-periods` | List available time periods |
| `GET /data` | Get data with filtering options |
| `GET /summary` | Statistical summary |
| `GET /rankings` | Top/bottom performing areas |
| `GET /correlation` | Population vs care quality analysis |
| `GET /map` | Generate choropleth map (PNG) |
| `GET /chart` | Generate scatter plot (PNG) |

### Example API Calls

```bash
# Get all indicators
curl http://localhost:8000/indicators

# Get data for Type 1 diabetes care processes
curl "http://localhost:8000/data?indicator_id=94146"

# Get top 5 performing areas
curl "http://localhost:8000/rankings?indicator_id=94146&n=5&order=top"

# Generate map (returns PNG)
curl "http://localhost:8000/map?indicator_id=94146" --output map.png

# Generate map as base64 (for web embedding)
curl "http://localhost:8000/map?indicator_id=94146&format=base64"
```

---

## Running the Web UI

The web UI is a static HTML/CSS/JS app in the `public/` folder.

### Option 1: Python HTTP Server

```bash
cd public
python3 -m http.server 3000
```

Open http://localhost:3000

### Option 2: VS Code Live Server

1. Install the "Live Server" extension in VS Code
2. Right-click `public/index.html`
3. Select "Open with Live Server"

### Option 3: Node.js (if installed)

```bash
cd public
npx serve .
```

> **Note**: By default, the UI connects to http://localhost:8000

### Configuring a Custom API URL

You can point the Web UI to a different API server (e.g., production) using these methods:

**Option 1: URL Parameter**

Add `?api=` to the URL:

```
http://localhost:3000?api=https://my-prod-api.com
```

**Option 2: Config File**

Create a `config.js` file in the `public/` folder:

```javascript
// public/config.js
window.API_URL = 'https://my-prod-api.com';
```

Then add it to `index.html` before `script.js`:

```html
<script src="./config.js"></script>
<script src="./script.js"></script>
```

**Option 3: Environment-based Config**

For deployment, you can use a build script to generate `config.js`:

```bash
# Example: create config for production
echo "window.API_URL = 'https://api.example.com';" > public/config.js
```

---

## Running the Jupyter Notebook

### 1. Register the Kernel

```bash
source venv/bin/activate
python -m ipykernel install --user --name=fingertips --display-name="Python (fingertips)"
```

### 2. Start Jupyter

**Option A: VS Code**
1. Open `fingertips.ipynb` in VS Code
2. Select kernel "Python (fingertips)" in the top right
3. Click "Run All"

**Option B: Browser**
```bash
source venv/bin/activate
jupyter notebook fingertips.ipynb
```

### What the Notebook Does

1. Loads Type 1 and Type 2 diabetes care data from Fingertips API
2. Loads ICB geographic boundaries from ONS
3. Creates choropleth maps showing care quality by region
4. Identifies best/worst performing areas
5. Analyzes correlation between population size and care quality

---

## Project Structure

```
fingertips/
├── api.py              # FastAPI backend
├── fingertips.ipynb    # Jupyter notebook analysis
├── public/             # Web UI
│   ├── index.html
│   ├── style.css
│   └── script.js
├── venv/               # Virtual environment
└── README.md
```

---

## Data Sources

- **Health Data**: [Public Health England Fingertips](https://fingertips.phe.org.uk/)
- **Geographic Boundaries**: [ONS Open Geography Portal](https://geoportal.statistics.gov.uk/)

## License

MIT
