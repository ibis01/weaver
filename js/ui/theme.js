if (window.Chart) {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.color = "#8b93a7";
  Chart.defaults.borderColor = "rgba(255,255,255,.06)";
  Chart.defaults.animation = { duration: 800, easing: "easeOutQuart" };
  const T = Chart.defaults.plugins.tooltip;
  T.backgroundColor = "rgba(16,18,30,.92)";
  T.titleColor = "#eef1f9";
  T.bodyColor = "#9aa3b2";
  T.borderColor = "rgba(124,92,255,.4)";
  T.borderWidth = 1;
  T.cornerRadius = 10;
  T.padding = 12;
  T.displayColors = false;
  T.titleFont = { weight: 700, family: "'Sora'" };
  const L = Chart.defaults.plugins.legend.labels;
  L.usePointStyle = true;
  L.pointStyle = "circle";
  L.boxWidth = 6;
  L.boxHeight = 6;
  L.padding = 16;
}
