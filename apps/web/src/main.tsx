import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { bootstrap } from "@mode";
import { RuntimeProvider } from "./core/runtime";
import { App } from "./features/shell/App";
import "leaflet/dist/leaflet.css";
import "./styles/app.css";

registerSW({ immediate: true });

const root = createRoot(document.getElementById("root")!);
bootstrap()
  .then(({ runtime, Gate }) =>
    root.render(
      <StrictMode>
        <RuntimeProvider value={runtime}>
          <Gate>
            <App />
          </Gate>
        </RuntimeProvider>
      </StrictMode>,
    ),
  )
  .catch((error: unknown) => {
    root.render(<p className="fatal">Start fehlgeschlagen: {String(error)}</p>);
  });
