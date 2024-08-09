# Adaptive to Zip Integration Scripts

These scripts integrate Workday adaptive budget and actual data with the Zip API, allowing seamless data transfer from your source system to Zip. It handles data aggregation, department and GL account mapping, and ensures that budget information is accurately uploaded.

### Overview

1. **Setup**: Enter your Zip API Key and ensure the required columns match the columns in your source data.
2. **Connection Test**: The `testConnection` function verifies the connection to the Zip API.
3. **Data Export**: The `exportData` function:
   - Aggregates your budget data by fiscal year.
   - Fetches department and GL account details from Zip.
   - Uploads the aggregated budgets to Zip.

### Customization

Simply copy this script into your Adaptive environment, update the API key and source columns, and you're ready to go.

## Upcoming Features

- **Quarterly Aggregation**: Future versions will allow budget data aggregation by quarter.
- **Department-Only Budgets**: Soon, you'll be able to create budgets specifically tied to departments, independent of GL accounts.
