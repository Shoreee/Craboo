import { train } from "./model.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ model: train(data.clips, data.key) });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
