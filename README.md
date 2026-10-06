# Modern Weather Dashboard

A beautiful, responsive, and feature-rich weather dashboard built with Vanilla JavaScript, HTML5, and CSS3.

## Features

- **Current Weather**: View real-time temperature, "feels like" temp, humidity, wind, pressure, and visibility.
- **5-Day Forecast**: See high/low temperatures and weather conditions for the week ahead.
- **Hourly Forecast**: Check upcoming weather hour by hour.
- **Temperature Chart**: Visual representation of temperature trends using Chart.js.
- **Geolocation**: Quickly get the weather for your current location.
- **Search History**: Automatically saves your recent searches for quick access (using LocalStorage).
- **Unit Toggle**: Easily switch between Celsius and Fahrenheit.
- **Dark Mode**: Supports light/dark mode toggling, alongside dynamic weather-based background colors.
- **Weather Insights**: Simple, practical text insights based on current weather conditions.

## Technologies Used

- **HTML5 & CSS3** (CSS Grid, Flexbox, UI variables, Media Queries)
- **Vanilla JavaScript** (ES6+, Async/Await, Fetch API)
- **Chart.js** (via CDN, for rendering the temperature graph)
- **OpenWeather API** (For weather data)

## How to Run Locally

This is a frontend-only application with no complex build steps required.

1. Clone or download this repository.
2. Open the project folder.
3. Simply double-click `index.html` to open it in your default web browser, OR start a simple local server:
   ```bash
   python -m http.server 8000
   # Then visit http://localhost:8000
   ```

## Security & API Key limitations
This project currently stores the OpenWeather API key directly in `index.js` for simplicity. **Note for production:** In a real-world application, you should never expose API keys on the frontend. A secure implementation would involve setting up a backend server (e.g., using Node.js/Express) that securely stores the API key in a `.env` file and handles the requests to the OpenWeather API on behalf of the client.

## Future Improvements
- Implement a backend proxy to secure the API key.
- Add autocomplete functionality to the city search bar.
- Add Air Quality Index (AQI) data.
