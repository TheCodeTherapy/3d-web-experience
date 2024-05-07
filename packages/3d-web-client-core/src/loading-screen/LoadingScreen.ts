import { LoadingProgressManager } from "mml-web";

export class LoadingScreen {
  public readonly element: HTMLDivElement;

  private loadingBannerText: HTMLDivElement;

  private progressBarBackground: HTMLDivElement;
  private progressBarHolder: HTMLDivElement;
  private progressBar: HTMLDivElement;
  private loadingStatusText: HTMLDivElement;

  private progressDebugViewHolder: HTMLDivElement;
  private progressDebugView: HTMLDivElement;
  private progressDebugElement: HTMLPreElement;

  private debugLabel: HTMLLabelElement;
  private debugCheckbox: HTMLInputElement;

  private hasCompleted = false;
  private loadingCallback: () => void;

  constructor(private loadingProgressManager: LoadingProgressManager) {
    this.element = document.createElement("div");
    this.element.style.position = "absolute";
    this.element.style.top = "0";
    this.element.style.left = "0";
    this.element.style.width = "100%";
    this.element.style.height = "100%";
    this.element.style.background = "linear-gradient(45deg, #28284B 0%, #303056 100%)";
    this.element.style.color = "white";
    this.element.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    this.element.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });
    this.element.addEventListener("mousemove", (event) => {
      event.stopPropagation();
    });
    this.element.addEventListener("mouseup", (event) => {
      event.stopPropagation();
    });

    this.loadingBannerText = document.createElement("div");
    this.loadingBannerText.textContent = "Loading...";
    this.loadingBannerText.style.position = "absolute";
    this.loadingBannerText.style.display = "flex";
    this.loadingBannerText.style.top = "0";
    this.loadingBannerText.style.left = "0";
    this.loadingBannerText.style.width = "100%";
    this.loadingBannerText.style.height = "100%";
    this.loadingBannerText.style.color = "white";
    this.loadingBannerText.style.fontSize = "80px";
    this.loadingBannerText.style.fontWeight = "bold";
    this.loadingBannerText.style.fontFamily = "sans-serif";
    this.loadingBannerText.style.alignItems = "center";
    this.loadingBannerText.style.justifyContent = "center";
    this.element.append(this.loadingBannerText);

    this.progressDebugViewHolder = document.createElement("div");
    this.progressDebugViewHolder.style.display = "flex";
    this.progressDebugViewHolder.style.position = "absolute";
    this.progressDebugViewHolder.style.maxHeight = "calc(100% - 74px)";
    this.progressDebugViewHolder.style.left = "0";
    this.progressDebugViewHolder.style.bottom = "74px";
    this.progressDebugViewHolder.style.width = "100%";
    this.progressDebugViewHolder.style.justifyContent = "center";
    this.element.append(this.progressDebugViewHolder);

    this.progressDebugView = document.createElement("div");
    this.progressDebugView.style.backgroundColor = "rgba(128, 128, 128, 0.25)";
    this.progressDebugView.style.border = "1px solid black";
    this.progressDebugView.style.maxWidth = "100%";
    this.progressDebugView.style.overflow = "auto";
    this.progressDebugViewHolder.append(this.progressDebugView);

    this.debugCheckbox = document.createElement("input");
    this.debugCheckbox.type = "checkbox";
    this.debugCheckbox.checked = false;
    this.debugCheckbox.addEventListener("change", () => {
      this.progressDebugElement.style.display = this.debugCheckbox.checked ? "block" : "none";
      if (this.hasCompleted) {
        this.dispose();
      }
    });

    this.debugLabel = document.createElement("label");
    this.debugLabel.textContent = "Debug loading";
    this.debugLabel.style.fontFamily = "sans-serif";
    this.debugLabel.style.padding = "5px";
    this.debugLabel.style.display = "inline-block";
    this.debugLabel.style.userSelect = "none";
    this.debugLabel.append(this.debugCheckbox);
    this.progressDebugView.append(this.debugLabel);

    this.progressDebugElement = document.createElement("pre");
    this.progressDebugElement.style.margin = "0";
    this.progressDebugElement.style.display = this.debugCheckbox.checked ? "block" : "none";
    this.progressDebugView.append(this.progressDebugElement);

    this.progressBarHolder = document.createElement("div");
    this.progressBarHolder.style.display = "flex";
    this.progressBarHolder.style.alignItems = "center";
    this.progressBarHolder.style.justifyContent = "center";
    this.progressBarHolder.style.position = "absolute";
    this.progressBarHolder.style.bottom = "20px";
    this.progressBarHolder.style.left = "0";
    this.progressBarHolder.style.width = "100%";
    this.element.append(this.progressBarHolder);

    this.progressBarBackground = document.createElement("div");
    this.progressBarBackground.style.position = "relative";
    this.progressBarBackground.style.width = "500px";
    this.progressBarBackground.style.maxWidth = "80%";
    this.progressBarBackground.style.backgroundColor = "gray";
    this.progressBarBackground.style.height = "50px";
    this.progressBarBackground.style.lineHeight = "50px";
    this.progressBarBackground.style.borderRadius = "25px";
    this.progressBarBackground.style.border = "2px solid white";
    this.progressBarBackground.style.overflow = "hidden";
    this.progressBarHolder.append(this.progressBarBackground);

    this.progressBar = document.createElement("div");
    this.progressBar.style.position = "absolute";
    this.progressBar.style.top = "0";
    this.progressBar.style.left = "0";
    this.progressBar.style.width = "0";
    this.progressBar.style.height = "100%";
    this.progressBar.style.backgroundColor = "#0050a4";
    this.progressBarBackground.append(this.progressBar);

    this.loadingStatusText = document.createElement("div");
    this.loadingStatusText.style.position = "absolute";
    this.loadingStatusText.style.top = "0";
    this.loadingStatusText.style.left = "0";
    this.loadingStatusText.style.width = "100%";
    this.loadingStatusText.style.height = "100%";
    this.loadingStatusText.style.color = "white";
    this.loadingStatusText.style.textAlign = "center";
    this.loadingStatusText.style.verticalAlign = "middle";
    this.loadingStatusText.style.fontFamily = "sans-serif";
    this.loadingStatusText.style.fontWeight = "bold";
    this.loadingStatusText.textContent = "Loading...";
    this.progressBarBackground.append(this.loadingStatusText);

    this.loadingCallback = () => {
      const [loadingRatio, completedLoading] = this.loadingProgressManager.toRatio();
      if (completedLoading) {
        if (!this.hasCompleted) {
          this.hasCompleted = true;
          if (!this.debugCheckbox.checked) {
            this.dispose();
          }
        }
        this.loadingStatusText.textContent = "Completed";
        this.progressBar.style.width = "100%";
      } else {
        this.loadingStatusText.textContent = `Loading... ${(loadingRatio * 100).toFixed(2)}%`;
        this.progressBar.style.width = `${loadingRatio * 100}%`;
      }
      this.progressDebugElement.textContent = LoadingProgressManager.LoadingProgressSummaryToString(
        this.loadingProgressManager.toSummary(),
      );
    };

    this.loadingProgressManager.addProgressCallback(this.loadingCallback);
  }

  public dispose() {
    this.loadingProgressManager.removeProgressCallback(this.loadingCallback);
    this.element.remove();
  }
}
