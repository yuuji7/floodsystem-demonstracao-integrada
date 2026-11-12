"""Prepare a local build of the original dashboard for embedding in the slide."""

import argparse
import shutil
from pathlib import Path

INTEGRATION = Path(__file__).resolve().parent
FRONTEND = INTEGRATION / ".runtime" / "frontend"


def replace(path: Path, original: str, replacement: str) -> None:
    source = path.read_text(encoding="utf-8")
    if source.count(original) != 1:
        raise ValueError(f"O ponto de integração mudou em {path.name}. Confira a versão do FloodSystem.")
    path.write_text(source.replace(original, replacement), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    source = args.source.resolve() / "frontend"
    FRONTEND.mkdir(parents=True, exist_ok=True)
    for name in ("package.json", "pnpm-lock.yaml", "index.html", "tsconfig.json", "vite.config.ts"):
        shutil.copyfile(source / name, FRONTEND / name)
    for name in ("public", "src"):
        shutil.copytree(source / name, FRONTEND / name, dirs_exist_ok=True)

    app = FRONTEND / "src" / "App.tsx"
    replace(app, "const initial: Filters = {", '''const demoDevice = new URLSearchParams(window.location.search).get("device");
const initial: Filters = {''')
    replace(app,
        '  device: import.meta.env.VITE_DEFAULT_DEVICE_ID || (import.meta.env.PROD ? "esp32-01" : "simulador-01"),',
        '  device: demoDevice && /^laboratorio-3d-[a-f0-9]{12}$/.test(demoDevice) ? demoDevice : "laboratorio-3d",')
    replace(app, '    window.history.replaceState(null, "", next === "history" ? "/?view=history" : "/");',
        '''    const url = new URL(window.location.href);
    if (next === "history") url.searchParams.set("view", "history");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);''')
    replace(app, '  const [advanced, setAdvanced] = useState(false);',
        '''  const [advanced, setAdvanced] = useState(false);
  const [showLabControls, setShowLabControls] = useState(false);''')
    replace(app, '    <div className="app-shell">',
        '    <div className={`app-shell${showLabControls ? " lab-show-controls" : ""}`}>')
    replace(app, '          <div className="topbar-right">', '''          <div className="topbar-right">
            <button
              type="button"
              className="lab-controls-toggle"
              aria-expanded={showLabControls}
              aria-controls="dashboard-filters dashboard-period dashboard-export"
              onClick={() => setShowLabControls(!showLabControls)}
            >
              Controles
            </button>''')
    replace(app, '<section className="page-heading">', '<section className="page-heading" id="dashboard-export">')
    replace(app, '<div className="filters">', '<div className="filters" id="dashboard-filters">')
    replace(app, '<div className="period-status">', '<div className="period-status" id="dashboard-period">')
    replace(app, 'window.setInterval(refreshVisible, 15000)', 'window.setInterval(refreshVisible, 10000)')
    replace(app, 'A consulta completa continua sendo feita a cada 15 segundos.',
        'A consulta completa continua sendo feita a cada 10 segundos.')
    replace(app, 'Ao vivo · 2 s', 'Ao vivo · 10 s')
    replace(app, '''            href="/ensaios/"
            onClick={() => setMobileMenu(false)}''', '''            href="https://floodsystem.duckdns.org/ensaios/"
            target="_blank" rel="noopener noreferrer"
            onClick={(event) => {
              setMobileMenu(false);
              if (window.parent !== window && new URLSearchParams(window.location.search).get("integrado") === "1") {
                event.preventDefault();
                window.parent.postMessage({ type: "floodsystem:show-experiments" }, window.location.origin);
              }
            }}''')

    main_file = FRONTEND / "src" / "main.tsx"
    replace(main_file, 'import "./styles.css";', 'import "./styles.css";\nimport "./lab-embed.css";')
    replace(main_file, 'const experimentsEnabled =', '''if (new URLSearchParams(window.location.search).get("apresentacao") === "1") {
  document.documentElement.classList.add("lab-embed");
}
window.addEventListener("message", (event) => {
  if (event.origin === window.location.origin && event.source === window.parent &&
      event.data?.type === "floodsystem:panel-layout") {
    document.documentElement.classList.toggle("lab-embed", event.data.compact === true);
  }
});

const experimentsEnabled =''')
    replace(main_file, 'currentPath === "/ensaios"', 'currentPath === "/painel/ensaios"')

    experiments = FRONTEND / "src" / "components" / "Experiments.tsx"
    replace(experiments, 'import { useEffect, useState } from "react";',
        'import { useEffect, useState, type MouseEvent } from "react";')
    replace(experiments, '  return <div className="experiments">', '''  const monitor = new URL("/painel/", window.location.origin);
  const current = new URL(window.location.href);
  monitor.search = current.search;
  const history = new URL(monitor);
  history.searchParams.set("view", "history");
  function showMonitor(event: MouseEvent<HTMLAnchorElement>, view: "live" | "history") {
    if (window.parent === window) return;
    event.preventDefault();
    window.parent.postMessage({ type: "floodsystem:show-monitor", view }, window.location.origin);
  }
  return <div className="experiments">''')
    replace(experiments, '<a href="/" className="experiment-brand">',
        '<a href={monitor.href} onClick={(event) => showMonitor(event, "live")} className="experiment-brand">')
    replace(experiments, '<a href="/">Tempo real</a>',
        '<a href={monitor.href} onClick={(event) => showMonitor(event, "live")}>Tempo real</a>')
    replace(experiments, '<a href="/?view=history">Histórico</a>',
        '<a href={history.href} onClick={(event) => showMonitor(event, "history")}>Histórico</a>')
    replace(experiments, '<a href="/ensaios/" aria-current="page">',
        '<a href={current.href} aria-current="page">')
    shutil.copyfile(INTEGRATION / "lab-embed.css", FRONTEND / "src" / "lab-embed.css")


if __name__ == "__main__":
    main()
