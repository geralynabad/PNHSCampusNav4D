export function attachCompassControl(map) {
  const button = document.getElementById("mapCompass");
  const rose = button.querySelector(".map-compass-rose");
  const updateBearing = () => {
    rose.style.transform = `rotate(${-map.getBearing()}deg)`;
  };

  map.on("rotate", updateBearing);
  map.on("move", updateBearing);
  updateBearing();
  button.addEventListener("click", () => {
    map.easeTo({ bearing: 0, duration: 450 });
  });
}
