# Nelson's BetLab Tracker

A personal sports betting analytics dashboard for tracking daily cards, model performance, and bankroll history.

## Stack
- React + Vite
- Recharts
- localStorage for persistence

## Dev
```bash
npm install
npm run dev
```

## Deploy
Connected to Vercel. Push to main = auto deploy.

## Splits scraper
`scripts/splits_scraper.py` pulls public betting splits (bets% vs money%),
best available odds, and one sportsbook's actual lines for NFL/MLB/NHL/NBA
from scoresandodds.com. Run standalone (e.g. in Colab) with:
```bash
pip install -r scripts/requirements.txt
python scripts/splits_scraper.py
```
