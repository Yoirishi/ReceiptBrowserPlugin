import ComboBox from "~src/components/ComboBox"
import { useState } from "react"

interface User {
  id: number;
  name: string;
  email: string;
}


export default function Popup() {
  const openViewer = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("tabs/viewer.html") })
  }


  const users: User[] = [
    { id: 1, name: "Александр Иванов", email: "alex@example.com" },
    { id: 2, name: "Мария Петрова", email: "maria@example.com" },
    { id: 3, name: "Дмитрий Сидоров", email: "dmitry@example.com" },
    { id: 4, name: "Анна Козлова", email: "anna@example.com" },
    { id: 5, name: "Иван Волков", email: "ivan@example.com" },
    { id: 6, name: "Елена Соколова", email: "elena@example.com" },
    { id: 7, name: "Михаил Орлов", email: "mikhail@example.com" },
    { id: 8, name: "Татьяна Лебедева", email: "tatyana@example.com" },
  ];

  const [selectedUser, setSelectedUser] = useState<User | null>(null)


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

      <ComboBox<User>
        items={users}
        getId={(u) => u.id}
        getText={(u) => u.name}
        value={selectedUser}
        onChange={setSelectedUser}
        searchable
        renderEmpty={(q) => <div style={{color:"#9CA3AF"}}>Ничего по “{q}”</div>}
      />
    </div>
  )
}
