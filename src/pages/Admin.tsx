import { useEffect, useMemo, useRef, useState } from "react";
import "/src/styles.css";
import { supabase } from "../lib/supabaseClient";
import type { Quiz, Room, Question, UUID } from "../types";

function useRoomsSubscription(roomCode: string | null, onChange: (r: Room) => void) {
  useEffect(() => {
    if (!roomCode) return;
    const channel = supabase
      .channel(`room_${roomCode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` },
        (payload) => {
          if (payload.new) onChange(payload.new as Room);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomCode, onChange]);
}

export default function Admin() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<UUID | "">("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const nextOrderRef = useRef<number>(1);

  // Tải danh sách quiz
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { alert("Lỗi tải quizzes: " + error.message); return; }
      setQuizzes(data as Quiz[]);
      if (data && data[0] && !selectedQuiz) setSelectedQuiz(data[0].id);
    })();
  }, []);

  // Tải câu hỏi của quiz được chọn
  useEffect(() => {
    (async () => {
      if (!selectedQuiz) { setQuestions([]); return; }
      const { data, error } = await supabase
        .from("questions")
        .select("id, quiz_id, order, content, time_limit_sec")
        .eq("quiz_id", selectedQuiz)
        .order("order", { ascending: true });
      if (error) { alert("Lỗi tải câu hỏi: " + error.message); return; }
      setQuestions(data as Question[]);
    })();
  }, [selectedQuiz]);

  // Subscribe rooms
  const subCode = (room?.room_code ?? roomCode) || null;
  useRoomsSubscription(subCode, (r) => { setRoom(r); });

  // Khi room thay đổi -> tải question hiện tại (nếu có)
  useEffect(() => {
    (async () => {
      if (!room?.current_question_id) { setCurrentQuestion(null); return; }
      const { data, error } = await supabase
        .from("questions")
        .select("id, quiz_id, order, content, time_limit_sec")
        .eq("id", room.current_question_id)
        .single();
      if (!error) setCurrentQuestion(data as Question);
    })();
  }, [room?.current_question_id]);

  const fetchRoomByCode = async () => {
    if (!roomCode.trim()) { alert("Nhập room code"); return; }
    const { data, error } = await supabase.from("rooms").select("*").eq("room_code", roomCode.trim()).single();
    if (error) { alert("Không tìm thấy phòng. Hãy mở phòng trước."); setRoom(null); return; }
    setRoom(data as Room);
  };

  const handleOpenRoom = async () => {
    const code = roomCode.trim();
    if (!selectedQuiz) { alert("Chọn một bộ đề"); return; }
    if (!code) { alert("Nhập room code"); return; }
    const secret = adminSecret.trim();
    if (!secret) { alert("Nhập admin secret"); return; }

    const { data, error } = await supabase.rpc("admin_open_room", {
      p_quiz_id: selectedQuiz,
      p_room_code: code,
      p_admin_secret: secret,
    });
    if (error) { alert("Lỗi mở phòng: " + error.message); return; }
    setRoom(data as Room);
    nextOrderRef.current = 1;
    alert(`Đã mở phòng ${code}.`);
  };

  const handleStartQuestion = async (order?: number) => {
    const code = room?.room_code || roomCode.trim();
    const secret = adminSecret.trim();
    if (!code || !secret) { alert("Thiếu room code / admin secret"); return; }
    const qOrder = order ?? nextOrderRef.current;
    const { data, error } = await supabase.rpc("admin_start_question", {
      p_room_code: code,
      p_admin_secret: secret,
      p_question_order: qOrder,
    });
    if (error) { alert("Lỗi start question: " + error.message); return; }
    setRoom(data as Room);
    nextOrderRef.current = qOrder;
  };

  const handleNext = async () => {
    const current = room?.current_question_order ?? 0;
    const next = current + 1;
    await handleStartQuestion(next);
  };

  const handleEnd = async () => {
    const code = room?.room_code || roomCode.trim();
    const secret = adminSecret.trim();
    if (!code || !secret) { alert("Thiếu room code / admin secret"); return; }
    const { data, error } = await supabase.rpc("admin_end_game", {
      p_room_code: code,
      p_admin_secret: secret,
    });
    if (error) { alert("Lỗi end game: " + error.message); return; }
    setRoom(data as Room);
    alert("Đã kết thúc game.");
  };

  const roomInfo = useMemo(() => {
    if (!room) return "Chưa có phòng";
    return `Phòng ${room.room_code} — Trạng thái: ${room.status} — Câu hiện tại: ${room.current_question_order ?? "-"}`;
  }, [room]);

  return (
    <div className="container">
      <div className="card">
        <h1>Bảng điều khiển Admin</h1>

        <div className="stack">
          <div className="card" style={{ background: "#f8fafc" }}>
            <h3>1) Chọn bộ đề</h3>
            <select className="select" value={selectedQuiz} onChange={(e) => setSelectedQuiz(e.target.value as UUID)}>
              {quizzes.map((q) => (<option key={q.id} value={q.id}>{q.title}</option>))}
            </select>

            <div className="card" style={{ marginTop: 12 }}>
              <h4>Danh sách câu hỏi</h4>
              {questions.length === 0 && <p>Chưa có câu hỏi.</p>}
              <ol>
                {questions.map(q => (
                  <li key={q.id} style={{ margin: "6px 0" }}>
                    <strong>Câu {q.order}</strong> ({q.time_limit_sec}s): {q.content}
                    <button className="btn" style={{ marginLeft: 8 }} onClick={() => handleStartQuestion(q.order)}>
                      Phát câu này
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="card" style={{ background: "#f8fafc" }}>
            <h3>2) Mở phòng</h3>
            <div className="stack">
              <input className="input" placeholder="Room code (VD: AP2025)" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
              <input className="input" placeholder="Admin secret (tự đặt)" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" onClick={handleOpenRoom}>Mở phòng</button>
                <button className="btn" onClick={fetchRoomByCode}>Tải trạng thái</button>
                <a className="btn" href={`/leaderboard/${encodeURIComponent(roomCode || room?.room_code || "")}`} target="_blank">
                  Mở Leaderboard
                </a>
              </div>
              <div><strong>Trạng thái:</strong> {roomInfo}</div>
            </div>
          </div>

          <div className="card" style={{ background: "#eef2ff" }}>
            <h3>3) Điều khiển nhanh</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => handleStartQuestion(1)}>Bắt đầu từ câu 1</button>
              <button className="btn" onClick={handleNext}>Câu tiếp theo</button>
              <button className="btn" onClick={handleEnd}>Kết thúc</button>
            </div>
            {currentQuestion && (
              <div className="card" style={{ marginTop: 12 }}>
                <div><strong>Câu {currentQuestion.order}</strong> — Thời gian: {currentQuestion.time_limit_sec}s</div>
                <div>{currentQuestion.content}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
