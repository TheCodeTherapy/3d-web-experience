import { SpawnConfigurationState } from "@mml-io/3d-web-client-core";
import { IframeWrapper, MMLScene, registerCustomElementsToWindow } from "@mml-io/mml-web";
import {
  EditableNetworkedDOM,
  IframeObservableDOMFactory,
  MMLWebRunnerClient,
} from "@mml-io/mml-web-runner";
import {
  StandaloneThreeJSAdapter,
  StandaloneThreeJSAdapterControlsType,
} from "@mml-io/mml-web-threejs-standalone";

import exampleMMLDocumentHTML from "./example-mml.html";
import { LocalAvatarClient } from "./LocalAvatarClient";
import { LocalAvatarServer } from "./LocalAvatarServer";

window.addEventListener("DOMContentLoaded", async () => {
  // Create an iframe that the clients can use to synchronize their view of the MML document to
  const { iframeWindow, iframeBody } = await IframeWrapper.create();
  // Register the MML (custom) elements to the iframe so that elements (e.g. m-cube) run the HTMLCustomElement logic when appended
  registerCustomElementsToWindow(iframeWindow);

  // Create a NetworkedDOM/MML document that the clients will connect to and interact with
  const networkedDOMDocument = new EditableNetworkedDOM(
    "http://example.com/index.html",
    IframeObservableDOMFactory,
    true,
  );

  // Create 4 quadrants to show the different views
  function makeQuadrant(top: string, left: string) {
    const holder = document.createElement("div");
    holder.style.position = "absolute";
    holder.style.width = "50%";
    holder.style.height = "50%";
    holder.style.top = top;
    holder.style.left = left;
    document.body.appendChild(holder);
    return holder;
  }
  const quadrant1 = makeQuadrant("0", "0");
  const quadrant2 = makeQuadrant("0", "50%");
  const quadrant3 = makeQuadrant("50%", "0");
  const quadrant4 = makeQuadrant("50%", "50%");

  // Create a "local" server that the avatar clients can connect to to see each other
  const localAvatarServer = new LocalAvatarServer();

  const client1SpawnConfig: SpawnConfigurationState = {
    spawnPosition: {
      x: -0.5,
      y: 0.5,
      z: 5,
    },
    spawnPositionVariance: {
      x: 0,
      y: 0,
      z: 0,
    },
    respawnTrigger: {
      minX: Number.NEGATIVE_INFINITY,
      maxX: Number.POSITIVE_INFINITY,
      minY: -100,
      maxY: Number.POSITIVE_INFINITY,
      minZ: Number.NEGATIVE_INFINITY,
      maxZ: Number.POSITIVE_INFINITY,
    },
    spawnYRotation: 180,
    enableRespawnButton: true,
  };

  // Create the first avatar client and append it to the first quadrant
  const client1 = new LocalAvatarClient(localAvatarServer, 1, client1SpawnConfig);
  client1.addDocument(networkedDOMDocument, iframeWindow, iframeBody);
  quadrant1.appendChild(client1.element);
  client1.update();

  const client2SpawnConfig: SpawnConfigurationState = {
    spawnPosition: {
      x: 0.5,
      y: 0.5,
      z: 5,
    },
    spawnPositionVariance: {
      x: 0,
      y: 0,
      z: 0,
    },
    spawnYRotation: 180,
    respawnTrigger: {
      minX: Number.NEGATIVE_INFINITY,
      maxX: Number.POSITIVE_INFINITY,
      minY: -100,
      maxY: Number.POSITIVE_INFINITY,
      minZ: Number.NEGATIVE_INFINITY,
      maxZ: Number.POSITIVE_INFINITY,
    },
    enableRespawnButton: false,
  };

  // Create the second avatar client and append it to the second quadrant
  const client2 = new LocalAvatarClient(localAvatarServer, 2, client2SpawnConfig);
  client2.addDocument(networkedDOMDocument, iframeWindow, iframeBody);
  quadrant2.appendChild(client2.element);
  client2.update();

  // Create a textarea that will be used to edit the MML document and append it to the third quadrant
  const textArea = document.createElement("textarea");
  textArea.style.width = "100%";
  textArea.style.height = "100%";
  textArea.style.boxSizing = "border-box";
  textArea.value = exampleMMLDocumentHTML;
  textArea.addEventListener("input", () => {
    networkedDOMDocument.load(textArea.value);
  });
  quadrant3.appendChild(textArea);

  // Load the source for the MML document into the NetworkedDOM
  networkedDOMDocument.load(textArea.value);

  // Create an MMLScene to show the MML document and append it to the fourth quadrant
  const sceneElement = document.createElement("div");
  sceneElement.style.width = "100%";
  sceneElement.style.height = "100%";
  const mmlScene = new MMLScene(sceneElement);
  quadrant4.append(mmlScene.element);

  StandaloneThreeJSAdapter.create(sceneElement, {
    controlsType: StandaloneThreeJSAdapterControlsType.DragFly,
  }).then((graphicsAdapter) => {
    mmlScene.init(graphicsAdapter);

    // Create a client that will synchronize the MMLScene with the local NetworkedDOM
    const flyCameraClient = new MMLWebRunnerClient(iframeWindow, iframeBody, mmlScene);
    flyCameraClient.connect(networkedDOMDocument);
  });
});
