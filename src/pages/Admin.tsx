import { useEffect, useMemo, useRef, useState } from "react";
import "/src/styles.css";
import { supabase } from "../lib/supabaseClient";
import type { Quiz, Room, Question, UUID, LeaderboardRow } from "../types";

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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, onChange]);
}

export default function Admin() {
  // Quiz & Questions
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<UUID | "">("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizStats, setQuizStats] = useState<{ count: number; maxPoints: number }>({ count: 0, maxPoints: 0 });

  // Room control
  const [roomCode, setRoomCode] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const nextOrderRef = useRef<number>(1);

  // Progress & Leaderboard
  const [participantsCount, setParticipantsCount] = useState<number>(0);
  const [answersCountCurrent, setAnswersCountCurrent] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  // ───────────────────────────────────────────────────────────
  // Tải danh sách quiz
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        alert("Lỗi tải quizzes: " + error.message);
        return;
      }
      setQuizzes(data as Quiz[]);
      if (data && data[0] && !selectedQuiz) setSelectedQuiz(data[0].id);
    })();
  }, []);

  // Tải câu hỏi của quiz + thống kê (số câu, max points)
  useEffect(() => {
    (async () => {
      if (!selectedQuiz) {
        setQuestions([]);
        setQuizStats({ count: 0, maxPoints: 0 });
        return;
      }
      const { data, error } = await supabase
        .from("questions")
        .select("id, quiz_id, order, content, time_limit_sec")
        .eq("quiz_id", selectedQuiz)
        .order("order", { ascending: true });
      if (error) {
        alert("Lỗi tải câu hỏi: " + error.message);
        return;
      }
      const list = data as Question[];
      setQuestions(list);
      setQuizStats({ count: list.length, maxPoints: list.length * 10 }); // mỗi câu tối đa 10đ
    })();
  }, [selectedQuiz]);

  // Subscribe rooms
  const subCode = (room?.room_code ?? roomCode) || null;
  useRoomsSubscription(subCode, (r) => {
    setRoom(r);
  });

  // Khi room thay đổi -> tải question hiện tại (nếu có), và refresh tiến trình/leaderboard
  useEffect(() => {
    (async () => {
      if (!room?.current_question_id) {
        setCurrentQuestion(null);
        setAnswersCountCurrent(0);
        if (room?.id) await refreshParticipants(room.id);
        if (room?.id) await refreshLeaderboard(room.id);
        return;
      }

      const { data, error } = await supabase
        .from("questions")
        .select("id, quiz_id, order, content, time_limit_sec")
        .eq("id", room.current_question_id)
        .single();
      if (!error) setCurrentQuestion(data as Question);

      if (room.id) {
        await refreshParticipants(room.id);
        await refreshAnswersCount(room.id, room.current_question_id);
        await refreshLeaderboard(room.id);
      }
    })();
  }, [room?.current_question_id, room?.question_start_at, room?.status]);

  // Subscribe scores/answers để cập nhật realtime bảng và tiến trình
  useEffect(() => {
    if (!room?.id) return;

    const chScores = supabase
      .channel(`scores_${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scores", filter: `room_id=eq.${room.id}` },
        async () => {
          await refreshLeaderboard(room.id!);
        }
      )
      .subscribe();

    const chAnswers = supabase
      .channel(`answers_${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "answers", filter: `room_id=eq.${room.id}` },
        async (payload) => {
          if (room.current_question_id && payload.new && payload.new["question_id"] === room.current_question_id) {
            await refreshAnswersCount(room.id!, room.current_question_id!);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chScores);
      supabase.removeChannel(chAnswers);
    };
  }, [room?.id, room?.current_question_id]);

  // Helpers
  const refreshParticipants = async (roomId: string) => {
    const { count } = await supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId);
    setParticipantsCount(count ?? 0);
  };

  const refreshAnswersCount = async (roomId: string, questionId: string) => {
    const { count } = await supabase
      .from("answers")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("question_id", questionId);
    setAnswersCountCurrent(count ?? 0);
  };

  const refreshLeaderboard = async (roomId: string) => {
    const { data, error } = await supabase
      .from("leaderboard_view")
      .select("*")
      .eq("room_id", roomId)
      .order("rank", { ascending: true });
    if (!error) setLeaderboard((data || []) as LeaderboardRow[]);
  };

  // ───────────────────────────────────────────────────────────
  // Actions
  const fetchRoomByCode = async () => {
    if (!roomCode.trim()) {
      alert("Nhập room code");
      return;
    }
    const { data, error } = await supabase.from("rooms").select("*").eq("room_code", roomCode.trim()).single();
    if (error) {
      alert("Không tìm thấy phòng. Hãy mở phòng trước.");
      setRoom(null);
      return;
    }
    setRoom(data as Room);
  };

  const handleOpenRoom = async () => {
    const code = roomCode.trim();
    if (!selectedQuiz) {
      alert("Chọn một bộ đề");
      return;
    }
    if (!code) {
      alert("Nhập room code");
      return;
    }
    const secret = adminSecret.trim();
    if (!secret) {
      alert("Nhập admin secret");
      return;
    }

    const { data, error } = await supabase.rpc("admin_open_room", {
      p_quiz_id: selectedQuiz,
      p_room_code: code,
      p_admin_secret: secret,
    });
    if (error) {
      alert("Lỗi mở phòng: " + error.message);
      return;
    }
    setRoom(data as Room);
    nextOrderRef.current = 1;
    alert(`Đã mở phòng ${code}.`);

    // ✅ Mở trang điều khiển riêng trong tab mới
    const url = `/control/${encodeURIComponent(code)}`;
    window.open(url, "_blank");
  };

  const handleStartQuestion = async (order?: number) => {
    const code = room?.room_code || roomCode.trim();
    const secret = adminSecret.trim();
    if (!code || !secret) {
      alert("Thiếu room code / admin secret");
      return;
    }
    const qOrder = order ?? nextOrderRef.current;
    const { data, error } = await supabase.rpc("admin_start_question", {
      p_room_code: code,
      p_admin_secret: secret,
      p_question_order: qOrder,
    });
    if (error) {
      alert("Lỗi start question: " + error.message);
      return;
    }
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
    if (!code || !secret) {
      alert("Thiếu room code / admin secret");
      return;
    }
    const { data, error } = await supabase.rpc("admin_end_game", {
      p_room_code: code,
      p_admin_secret: secret,
    });
    if (error) {
      alert("Lỗi end game: " + error.message);
      return;
    }
    setRoom(data as Room);
    alert("Đã kết thúc game.");
  };

  const saveTimeLimit = async (q: Question, newVal: number) => {
    if (Number.isNaN(newVal) || newVal < 10 || newVal > 20) {
      alert("time_limit_sec phải trong 10…20 giây");
      return;
    }
    const { error } = await supabase
      .from("questions")
      .update({ time_limit_sec: newVal })
      .eq("id", q.id);
    if (error) {
      alert("Sửa thời gian lỗi: " + error.message);
      return;
    }
    setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, time_limit_sec: newVal } : x)));
    if (currentQuestion?.id === q.id) setCurrentQuestion({ ...q, time_limit_sec: newVal });
    alert(`Đã cập nhật thời gian câu ${q.order} = ${newVal}s`);
  };

  // UI helpers
  const roomInfo = useMemo(() => {
    if (!room) return "Chưa có phòng";
    return `Phòng ${room.room_code} — Trạng thái: ${room.status} — Câu hiện tại: ${
      room.current_question_order ?? "-"
    }`;
  }, [room]);

  return (
    <div className="container">
      <div className="card">
        <h1>Bảng điều khiển Admin</h1>

        <div className="stack">
          {/* 1) Bộ đề + thống kê */}
          <div className="card" style={{ background: "#f8fafc" }}>
            <h3>1) Chọn bộ đề</h3>
            <select
              className="select"
              value={selectedQuiz}
              onChange={(e) => setSelectedQuiz(e.target.value as UUID)}
            >
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>

            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <strong>Số câu:</strong> {quizStats.count}
                </div>
                <div>
                  <strong>Tổng điểm tối đa:</strong> {quizStats.maxPoints}
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <h4>Danh sách câu hỏi (chỉnh được thời gian 10–20s)</h4>
              {questions.length === 0 && <p>Chưa có câu hỏi.</p>}
              <ol>
                {questions.map((q) => (
                  <li key={q.id} style={{ margin: "6px 0" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 60 }}>
                        <strong>Câu {q.order}</strong>
                      </div>
                      <div style={{ color: "#475569" }}>({q.time_limit_sec}s)</div>
                      <button className="btn" onClick={() => handleStartQuestion(q.order)}>
                        Phát câu này
                      </button>
                      <label style={{ marginLeft: 8 }}>
                        Thời gian:
                        <input
                          type="number"
                          min={10}
                          max={20}
                          className="input"
                          style={{ width: 80, marginLeft: 6 }}
                          defaultValue={q.time_limit_sec}
                          onBlur={(e) => saveTimeLimit(q, Number(e.target.value))}
                        />
                        s
                      </label>
                    </div>
                    <div style={{ marginTop: 4 }}>{q.content}</div>
                  </li>
                ))}
              </ol>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                * Sửa ô thời gian rồi rời chuột khỏi ô (blur) để lưu.
              </div>
            </div>
          </div>

          {/* 2) Mở phòng */}
          <div className="card" style={{ background: "#f8fafc" }}>
            <h3>2) Mở phòng</h3>
            <div className="stack">
              <input
                className="input"
                placeholder="Room code (VD: AP2025)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
              />
              <input
                className="input"
                placeholder="Admin secret (tự đặt)"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" onClick={handleOpenRoom}>
                  Mở phòng
                </button>
                <button className="btn" onClick={fetchRoomByCode}>
                  Tải trạng thái
                </button>
                <a
                  className="btn"
                  href={`/leaderboard/${encodeURIComponent(
                    roomCode || room?.room_code || ""
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở Leaderboard (tab mới)
                </a>
              </div>
              <div>
                <strong>Trạng thái:</strong> {roomInfo}
              </div>
            </div>

            {/* Tiến trình hiện tại */}
            {room && (
              <div className="card" style={{ marginTop: 12 }}>
                <h4>Tiến trình phòng</h4>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <strong>Số người tham gia:</strong> {participantsCount}
                  </div>
                  <div>
                    <strong>Đã trả lời câu hiện tại:</strong>{" "}
                    {answersCountCurrent}/{participantsCount}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3) Điều khiển nhanh + Câu đang phát */}
          <div className="card" style={{ background: "#eef2ff" }}>
            <h3>3) Điều khiển nhanh</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => handleStartQuestion(1)}>
                Bắt đầu từ câu 1
              </button>
              <button className="btn" onClick={handleNext}>
                Câu tiếp theo
              </button>
              <button className="btn" onClick={handleEnd}>
                Kết thúc
              </button>
            </div>
            {currentQuestion && (
              <div className="card" style={{ marginTop: 12 }}>
                <div>
                  <strong>Câu {currentQuestion.order}</strong> — Thời gian:{" "}
                  {currentQuestion.time_limit_sec}s
                </div>
                <div>{currentQuestion.content}</div>
              </div>
            )}
          </div>

          {/* 4) Leaderboard ngay trong Admin */}
          <div className="card" style={{ background: "#f1f5f9" }}>
            <h3>4) Leaderboard (live)</h3>
            {!room?.id && <p>Hãy mở phòng để hiển thị bảng xếp hạng.</p>}
            {room?.id && (
              <div className="card">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th>#</th>
                      <th>Nickname</th>
                      <th>Tổng điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.length === 0 && (
                      <tr>
                        <td colSpan={3}>Chưa có điểm.</td>
                      </tr>
                    )}
                    {leaderboard.map((r) => (
                      <tr key={r.participant_id}>
                        <td>{r.rank}</td>
                        <td>{r.nickname}</td>
                        <td>{r.total_points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ fontSize: 12, color: "#64748b" }}>
              * Bảng này tự cập nhật khi có điểm mới.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
