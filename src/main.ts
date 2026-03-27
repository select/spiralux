import "./style.css";
import { createApp } from "vue";
import App from "./App.vue";
import { loadSavedTheme } from "./themes";

loadSavedTheme();
createApp(App).mount("#app");
