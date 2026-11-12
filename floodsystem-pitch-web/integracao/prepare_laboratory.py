"""Build the embedded lab from the complete local Web3D application."""

import shutil

from prepare_frontend import INTEGRATION, replace


def main():
    presentation = INTEGRATION.parent
    source = presentation.parent / "floodsystem-web3d" / "dist"
    if not (source / "app.js").is_file():
        raise FileNotFoundError(f"Laboratório Web3D não encontrado em {source}")
    target = INTEGRATION / ".runtime" / "laboratory"
    shutil.copytree(source, target, dirs_exist_ok=True)
    shutil.copyfile(presentation / "engine" / "physics.mjs", target / "physics.mjs")
    shutil.copyfile(presentation / "lab-telemetry.mjs", target / "lab-telemetry.mjs")
    shutil.copyfile(INTEGRATION / "embedded-lab.mjs", target / "embedded-lab.mjs")

    index = target / "index.html"
    replace(index, '<link rel="stylesheet" href="./style.css">', '''<link rel="stylesheet" href="./style.css">
  <style>
    #integration-status { margin: 0 0 10px; padding: 8px 10px; background: #e4f0e9; border-radius: 6px; color: #264b3d; font-size: 12px; }
    .topbar { min-height: 51px; height: auto; gap: 8px; padding: 7px 12px; flex-wrap: wrap; }
    .topbar .brand { font-size: 19px; }
    main { padding: 10px 12px 0; }
    .intro { margin-bottom: 8px; }
    .intro h1 { font-size: 24px; }
    .intro-copy { margin-top: 4px; }
    .screen-nav { margin-bottom: 8px; }
    [data-screen="overview"]:not([hidden]) { display: flex; flex-direction: column; }
    [data-screen="overview"] .metrics { order: 2; margin-top: 10px; }
    #manual-workspace #viewport { height: clamp(255px, 50vh, 420px); }
    @media (min-width: 540px) {
      #manual-workspace { grid-template-columns: minmax(0, 1fr) minmax(226px, .77fr); gap: 9px; }
      #manual-workspace .controls { display: flex; flex-direction: column; max-height: clamp(335px, 67vh, 500px); }
      #manual-workspace .control-body { overflow: auto; min-height: 0; padding-inline: 12px; }
      #manual-workspace .control-footer { flex: none; }
      #manual-workspace .viewport-header, #manual-workspace .viewport-footer { flex-wrap: wrap; padding: 7px; }
    }
  </style>''')
    replace(index, '<main id="app" data-audience="client">', '''<main id="app" data-audience="client">
    <p id="integration-status" role="status">Pronto para enviar ao painel ao iniciar em 1×.</p>''')

    app = target / "app.js"
    replace(app, "import { openRegion, closeRegion, regionalFrame } from './region.js';",
        """import { openRegion, closeRegion, regionalFrame } from './region.js';
import { advanceLab, labVisible, regionalMode } from './embedded-lab.mjs';""")
    replace(app, "const p={...DEFAULTS};", "const p={...DEFAULTS, speed:1};")
    replace(app, "settings:{...DEFAULTS, rain:90}", "settings:{...DEFAULTS, rain:90, speed:1}")
    replace(app, "let state=createState(p),paused=false,", "let state=createState(p),paused=true,")
    replace(app, "selectScreen(screenFromHash());\nasync function initializeModel()", "selectAudience('admin');\nasync function initializeModel()")
    replace(app, "  if (screen === 'region') {\n    const weather = regionalFrame(wallDt);", '''  if (!labVisible()) { requestAnimationFrame(frame); return; }
  if (screen === 'region') {
    regionalMode();
    const weather = regionalFrame(wallDt);''')
    replace(app, "    if (!demo.paused) advance(demo.state, demo.settings, wallDt * demo.settings.speed);",
        "    advanceLab(demo.state, demo.settings, demo.paused, now, wallDt);")
    replace(app, "  if(!paused)advance(state,p,wallDt*p.speed);", "  advanceLab(state, p, paused, now, wallDt);")
    replace(app, "DEFAULTS, createState, advance, readings,", "DEFAULTS, createState, readings,")


if __name__ == "__main__":
    main()
