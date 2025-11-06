export class ErrorScreen {
  public readonly element: HTMLDivElement;

  private titleBannerText: HTMLDivElement;
  private messageText: HTMLDivElement;

  constructor(title: string, message: string) {
    this.element = document.createElement("div");
    this.element.style.position = "absolute";
    this.element.style.top = "0";
    this.element.style.left = "0";
    this.element.style.display = "flex";
    this.element.style.alignItems = "center";
    this.element.style.justifyContent = "center";
    this.element.style.flexDirection = "column";
    this.element.style.width = "100%";
    this.element.style.height = "100%";
    this.element.style.zIndex = "10000";
    this.element.style.background = "linear-gradient(45deg, #111111 0%, #444444 100%)";
    this.element.style.color = "white";

    this.titleBannerText = document.createElement("div");
    this.titleBannerText.textContent = title;
    this.titleBannerText.style.fontSize = "40px";
    this.titleBannerText.style.fontWeight = "bold";
    this.titleBannerText.style.fontFamily = "sans-serif";
    this.element.append(this.titleBannerText);

    this.messageText = document.createElement("div");
    this.messageText.style.textAlign = "center";
    this.messageText.style.fontFamily = "sans-serif";
    this.messageText.style.fontWeight = "bold";
    this.messageText.textContent = message;
    this.element.append(this.messageText);
  }

  public dispose() {
    this.element.remove();
  }
}
