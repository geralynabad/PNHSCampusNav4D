// Collapsible map legend. Open by default on large screens, closed on phones;
// remembers the user's choice.
export function initLegend() {
  const root = document.getElementById("legend");
  const btn = document.getElementById("legendToggle");
  if (!root || !btn) return;
  const KEY = "pnhs_legend_open";
  const saved = localStorage.getItem(KEY);
  let open = saved === null ? window.innerWidth > 760 : saved === "1";
  const apply = () => {
    root.classList.toggle("collapsed", !open);
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => {
    open = !open;
    localStorage.setItem(KEY, open ? "1" : "0");
    apply();
  });
  apply();
}
