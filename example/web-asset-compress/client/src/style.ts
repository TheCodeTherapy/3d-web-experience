export const tweakPaneStyle = `
:root {
  --tp-base-background-color: rgba(12, 12, 12, 0.6);
  --tp-base-shadow-color: hsla(0, 0%, 0%, 0.2);
  --tp-button-background-color: hsla(0, 0%, 80%, 1);
  --tp-button-background-color-active: hsla(0, 0%, 100%, 1);
  --tp-button-background-color-focus: hsla(0, 0%, 95%, 1);
  --tp-button-background-color-hover: hsla(0, 0%, 85%, 1);
  --tp-button-foreground-color: hsla(0, 0%, 0%, 0.7);
  --tp-container-background-color: hsla(0, 0%, 0%, 0.3);
  --tp-container-background-color-active: hsla(0, 0%, 0%, 0.6);
  --tp-container-background-color-focus: hsla(0, 0%, 0%, 0.5);
  --tp-container-background-color-hover: hsla(0, 0%, 0%, 0.4);
  --tp-container-foreground-color: hsla(0, 0%, 90%, 0.6);
  --tp-groove-foreground-color: hsla(0, 0%, 0%, 0.2);
  --tp-input-background-color: hsla(0, 0%, 30%, 0.3);
  --tp-input-background-color-active: hsla(0, 0%, 0%, 0.6);
  --tp-input-background-color-focus: hsla(0, 0%, 0%, 0.5);
  --tp-input-background-color-hover: hsla(0, 0%, 0%, 0.4);
  --tp-input-foreground-color: hsla(0, 0%, 100%, 0.6);
  --tp-label-foreground-color: hsla(0, 0%, 100%, 0.6);
  --tp-monitor-background-color: hsla(0, 0%, 0%, 0.3);
  --tp-monitor-foreground-color: hsla(0, 0%, 100%, 0.3);
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.tp-brkv {
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.tp-dfwv {
  position: absolute !important;
  display: flex !important;
  top: 8px !important;
  right: 8px !important;
  box-sizing: border-box;
  justify-content: flex-end;
  z-index: 1000;
  color: white;
  width: 315px !important;
  display: none;
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.tp-fldv {
  margin: 1px 0px 0px 0px !important;
}

.tp-fldv_b {
  overflow: visible !important;
}

.tp-fldv_t {
  font-size: 13px;
  font-weight: 900;
  color: #ffffff;
  background-color: rgba(70, 70, 70, 0.3);
  border-top: 1px solid rgba(210, 210, 210, 0.1);
  border-radius: 3px;
}

.tp-lblv_l {
  font-size: 12px;
  padding-left: 0px !important;
  padding-right: 0px !important;
}

.tp-lblv_v {
  width: 150px;
}

.tp-sldtxtv_t {
    max-width: 50px;
}

.tp-sglv_i {
  font-size: 12px !important;
  color: white !important;
  font-weight: 900 !important;
}

.tp-ckbv_w {
  border: 1px solid rgba(200, 200, 250, 0.2);
}
`;

export const toastStyle = `
.toast-container {
  position: fixed;
  top: 10px;
  right: 333px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toast {
  padding: 12px 20px;
  border-radius: 6px;
  color: #fff;
  font-family: sans-serif;
  font-size: 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  animation: fadeIn 0.3s ease, fadeOut 0.3s ease 3.7s forwards;
}

.toast.success { background-color: #28a745; }
.toast.error { background-color: #dc3545; }
.toast.info { background-color: #007bff; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; transform: translateY(-10px); }
}
`;
