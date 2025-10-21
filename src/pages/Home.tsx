import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "/src/styles.css";

export default function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const nick = nickname.trim();
    const code = roomCode.trim();
    if (!nick || !code) return;
    localStorage.setItem("apq:nickname", nick);
    navigate(`/play/${encodeURIComponent(code)}`);
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Tham gia trò chơi</h1>
        <p>Nhập <strong>Nickname</strong> và <strong>Room code</strong> do Admin cung cấp.</p>
        <form className="stack" onSubmit={handleJoin}>
          <div>
            <label>Nickname</label>
            <input
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="VD: TangPham"
            />
          </div>
          <div>
            <label>Room code</label>
            <input
              className="input"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="VD: AP2025"
            />
          </div>
          <button className="btn" type="submit">Tham gia</button>
        </form>
      </div>

      <div style={{ height: 12 }} />
      <div className="card">
        <h2>Hướng dẫn nhanh</h2>
        <ol>
          <li>Nhận <em>Room code</em> từ Admin.</li>
          <li>Nhập tên và join phòng.</li>
          <li>Chờ Admin bắt đầu — câu hỏi sẽ hiển thị real-time.</li>
        </ol>
      </div>
    </div>
  );
}
