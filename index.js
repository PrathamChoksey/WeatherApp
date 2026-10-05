const form = document.querySelector('.WeatherForm');
const input = document.querySelector('.cityinput');
const display = document.querySelector('.card');
const apiKey = 'b448302a8ba89ab1f7e9480ac6d97b8d';

form.addEventListener('submit', async e => {
    e.preventDefault();

    input.classList.remove('is-invalid');
    form.classList.add('was-validated');

    if (!input.value) {
        return; 
    }

    const cityName = input.value;

    try {
        const data = await getData(cityName);
        displayWeather(data);
        display.style.display = 'block';
    } catch (error) {
        console.error(error);
        displayError(error.message);
    }
});

async function getData(cityName) {
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${apiKey}&units=metric`;

    let apiResponse;
    try {
        apiResponse = await fetch(apiUrl);
    } catch (error) {
        throw new Error('Network error: Could not connect to OpenWeather API');
    }

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
        console.error('OpenWeather API error:', responseData);
        if (apiResponse.status === 401) {
            throw new Error('Invalid or inactive API key. Please check your API key.');
        } else if (apiResponse.status === 404) {
            throw new Error(`City not found: ${cityName}`);
        } else {
            throw new Error(`OpenWeather error ${apiResponse.status}: ${responseData.message || 'Unknown error'}`);
        }
    }

    return responseData;
}

function displayWeather(data) {
    const nameDisplay = document.querySelector('.citydisplay');
    const tempDisplay = document.querySelector('.tempdisplay');
    const humidityDisplay = document.querySelector('.humiditydisplay');
    const descriptionDisplay = document.querySelector('.descpdisplay');
    const iconDisplay = document.querySelector('.WeatherEmoji');
    const errorDisplay = document.querySelector('.errorDisplay');

    if (errorDisplay) {
        errorDisplay.style.display = 'none';
        errorDisplay.innerHTML = '';
    }
    if (iconDisplay) iconDisplay.style.display = 'block';

    const {
        name: cityName,
        main: { temp, humidity },
        weather: [{ description, icon }]
    } = data;

    nameDisplay.innerHTML = cityName;
    tempDisplay.innerHTML = `${Math.round(temp)}°C`;
    humidityDisplay.innerHTML = `Humidity: ${humidity}%`;
    descriptionDisplay.innerHTML = `Description: ${description}`;
    
    if (iconDisplay) {
        if (iconDisplay.tagName.toLowerCase() === 'img') {
            iconDisplay.src = `https://openweathermap.org/img/wn/${icon}@2x.png`;
        } else {
            iconDisplay.innerHTML = `<img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="Weather icon">`;
        }
    }
}

function displayError(message) {
    const errorDisplay = document.querySelector('.errorDisplay');
    const nameDisplay = document.querySelector('.citydisplay');
    const tempDisplay = document.querySelector('.tempdisplay');
    const humidityDisplay = document.querySelector('.humiditydisplay');
    const descriptionDisplay = document.querySelector('.descpdisplay');
    const iconDisplay = document.querySelector('.WeatherEmoji');

    display.style.display = 'block';

    if (errorDisplay) {
        errorDisplay.style.display = 'block';
        errorDisplay.innerHTML = message;
    }

    if (nameDisplay) nameDisplay.innerHTML = '';
    if (tempDisplay) tempDisplay.innerHTML = '';
    if (humidityDisplay) humidityDisplay.innerHTML = '';
    if (descriptionDisplay) descriptionDisplay.innerHTML = '';
    if (iconDisplay) iconDisplay.style.display = 'none';
}