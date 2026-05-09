// Clicking the extension icon opens a floating recorder window.
// A window (not a popup) stays open when user switches tabs — recording keeps going.
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url:    chrome.runtime.getURL('recorder.html'),
    type:   'popup',
    width:  480,
    height: 700,
    focused: true,
  });
});
