# StockGrow — Final deployment guide (GitHub + MongoDB Atlas + Render)

This package keeps the React frontend supplied in `StockGrow_Complete_Updated(1).zip`, including its login / create-business screen, and the matching Express API. Do not mix files from older StockGrow ZIPs into this folder.

## A. Upload the project to GitHub (PowerShell)

1. Extract this ZIP. Open PowerShell in the extracted `STOCKGROW` folder (the folder containing this README).
2. Confirm there is no real `.env` file in either `backend` or `frontend`. Commit only `.env.example` files. Never upload database passwords or JWT secrets.
3. Run:

```powershell
git init
git add .
git commit -m "StockGrow final deployment"
git branch -M main
```

4. Create an empty repository on GitHub named `StockGrow` (do not add a README or .gitignore there).
5. Copy the repository HTTPS URL from GitHub, then run (replace the URL with yours):

```powershell
git remote add origin https://github.com/YOUR-USERNAME/StockGrow.git
git push -u origin main
```

If Git says `remote origin already exists`, run `git remote set-url origin https://github.com/YOUR-USERNAME/StockGrow.git` and then `git push -u origin main`.

## B. Connect MongoDB Atlas

1. In MongoDB Atlas, create or select a cluster and a database named `stockgrow`.
2. Create a database user with a strong password. This is NOT your Atlas website login.
3. In Atlas Network Access, allow the Render service to connect. For a Render deployment without fixed outbound IPs, Atlas may require `0.0.0.0/0`; use a strong database-user password and never share the URI publicly. Tighten the network rule if you have fixed egress IPs.
4. Select Connect → Drivers and copy the MongoDB connection string. Replace `<password>` with the database user's password and include `/stockgrow` before the query string, for example:

`mongodb+srv://DB_USER:DB_PASSWORD@YOUR_CLUSTER.mongodb.net/stockgrow?retryWrites=true&w=majority`

URL-encode special characters in the database password. Do not put this URI in GitHub or in frontend environment variables.

## C. Deploy the backend API on Render

1. In Render, choose **New → Web Service** and connect the GitHub `StockGrow` repository.
2. Set:
   - Name: `stockgrow-api`
   - Root Directory: `backend`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Add these Environment Variables in Render (use the actual values; never commit them):
   - `NODE_ENV` = `production`
   - `MONGO_URI` = your full MongoDB Atlas connection string
   - `JWT_SECRET` = a new, random secret at least 32 characters long
   - `CLIENT_URL` = leave temporarily as `http://localhost:5173`; update it after the frontend is deployed
4. Click **Create Web Service** and wait for the deploy to finish. Copy the backend URL, e.g. `https://stockgrow-api.onrender.com`.
5. Test `https://YOUR-BACKEND-URL/api/health`. It should return JSON with `status` equal to `ok` and `database` equal to `connected`.

## D. Deploy the frontend on Render

1. In Render choose **New → Static Site** and connect the SAME GitHub repository.
2. Set:
   - Name: `stockgrow-frontend`
   - Root Directory: `frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
3. Add this frontend Environment Variable BEFORE the first build:
   - `VITE_API_URL` = `https://YOUR-BACKEND-URL.onrender.com/api` (use your real backend URL from section C)
4. Create the Static Site and wait for the build. Copy its public URL, e.g. `https://stockgrow-frontend.onrender.com`.

## E. Connect frontend and backend

1. Open the backend Web Service in Render → Environment.
2. Set `CLIENT_URL` to the exact frontend URL from section D (no trailing slash).
3. Save changes and let Render redeploy the backend.
4. Open the frontend URL, choose **Create business**, and register the first business administrator. Then log in. Admins can create staff/admin accounts from the Team page.

## F. Final checks

- `/api/health` reports `database: connected`.
- Login and create-business work.
- Add a product, refresh, and confirm it remains saved.
- Record a sale and confirm quantity decreases and the sale appears in Sales and Reports.
- Check low-stock alerts and restock suggestions.
- Test staff permissions with a separate staff account.
- Camera barcode scanning requires HTTPS and a browser that supports `BarcodeDetector`; manual barcode entry is the fallback.

## Important notes

- Use this ZIP as one project. Do not combine it with the older `StockGrow_Deployment_Ready` package or the original `STOCKGROW.zip`.
- Keep `backend/.env` and all secrets out of GitHub. Render environment variables hold production secrets.
- The app's offline queue is basic and not a multi-device conflict-resolution system.
- Restock recommendations are a sales-velocity heuristic, not a trained ML model.
- The code is not load-tested or certified for 1 million transactions per day. Do not claim that throughput without testing the actual Render plan and Atlas cluster.
- Render free services may sleep when idle; the first request after idle can take longer.
