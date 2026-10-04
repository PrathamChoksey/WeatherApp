const weatherForm = document.querySelector(".weatherForm");
const cityInput = document.queryselector(".cityInput");
const card = document.querySelector(".card");
const apikey = "b448302a8ba89ab1f7e9480ac6d97b8d";

weatherForm.addEventListener("submit",event => {
    event.preventDefault();
    const city = cityInput.value;

    if(city){

    }
    else{
        displayError("pls enter a city");
    }

});

async function getWeatherData(city){

}
function displayWeatherInfo(data){

}
function getWeatherEmoji(weatherId){

}
function displayError(message){
    const errorDisplay = document.createElement("p");
    errorDisplay.textContent = message;
    errorDisplay.classList.add("errorDisplay");
    card.textContent= "";
    card.style.display = "flex";
    card.appendChild(errorDisplay);
}