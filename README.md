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

## Running API with PM2

To run your FastAPI app under **pm2** while still using your virtual environment, wrap the command in a small shell script so pm2 can activate the venv and launch Uvicorn.

### 1. Create a start script

Create a file named `start_api.sh` in your project root:

```bash
#!/bin/bash
source venv/bin/activate
exec uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

Make it executable:

```bash
chmod +x start_api.sh
```

### 2. Start it with pm2

```bash
pm2 start ./start_api.sh --name fastapi-app
```

### 3. (Optional) Save pm2 process list and enable startup

```bash
pm2 save
pm2 startup
```

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

You can point the Web UI to a different API server (e.g., production) using this method:

1. Go to /public/script.js

2. Change:
```javascript
const DEFAULT_API_URL = 'http://localhost:8000'
```
to:
```javascript
const DEFAULT_API_URL = 'API URL OF CHOICE'

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
