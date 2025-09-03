export default function Popup() {
    const openViewer = () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("tabs/viewer.html") })
    }


    return (
        <div style={{ padding: 14, width: 340, fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif" }}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>Receipt Parser</h3>
            <p style={{ margin: 0, marginBottom: 12, color: "#555", fontSize: 13 }}>
                Open the viewer to load DuckDB, insert rows, browse, and export.
            </p>
            <button
                onClick={openViewer}
                style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600
                }}>
                Open Viewer
            </button>


            <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
                Tip: keep this popup light; all heavy work happens in the viewer.
            </div>
        </div>
    )
}
