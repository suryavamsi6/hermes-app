// Background tasks must be defined before the app loads, including in the headless start Android
// uses to run them while the app is closed.
import "./src/background-check";
import "expo-router/entry";
