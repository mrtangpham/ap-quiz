import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "/src/styles.css";
import { supabase } from "../lib/supabaseClient";
import type { Room, Question, LeaderboardRow } from "../types";

export default function ControlRoom() {
  const { roomCode = "" } = useParams();

  const [room, setRoom] = useState<Room | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [participantsCount, setParticipantsCount] = useState<number>(0);
  const [answersCountCurrent, setAnswersCountCurrent] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [adminSecret, setAdminSecret] = useState<string>("");

  // Load room lần đầu & subscribe realtime
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("room_code", roomCode).single();
      if (!error && data) setRoom(data as Room);
    })();
    const ch = supabase
      .channel(`control_room_${roomCode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` },
        (payload) => payload.new && setRoom(payload.new as Room))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [roomCode]);

  // Khi room đổi → load câu, tiến trình, leaderboard
  useEffect(() => {
    (async () => {
      if (!room) return;
      if (room.current_question_id) {
        const { data } = await supabase
          .from("questions").select("id, quiz_id, order, content, time_limit_sec")
          .eq("id", room.current_question_id).single();
        if (data) setQuestion(data as Question);
      } else {
        setQuestion(null);
      }
      await refreshParticipants(room.id);
      if (room.current_question_id) await refreshAnswersCount(room.id, room.current_question_id);
      await refreshLeaderboard(room.id);
    })();
  }, [room?.id, room?.current_question_id, room?.question_start_at, room?.status]);

  // Subscribe scores/answers để cập nhật live
  useEffect(() => {
    if (!room?.id) return;
    const sc = supabase
      .channel(`scores_${room.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scores", filter: `room_id=eq.${room.id}` },
        async () => { await refreshLeaderboard(room.id!); })
      .subscribe();
    const ans = supabase
      .channel(`answers_${room.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: `room_id=eq.${room.id}` },
        async (payload) => {
          if (room.current_question_id && payload.new && payload.new["question_id"] === room.current_question_id) {
            await refreshAnswersCount(room.id!, room.current_question_id!);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(sc); supabase.removeChannel(ans); };
  }, [room?.id, room?.current_question_id]);

  // Helpers
  const refreshParticipants = async (roomId: string) => {
    const { count } = await supabase.from("participants").select("id", { count: "exact", head: true }).eq("room_id", roomId);
    setParticipantsCount(count ?? 0);
  };
  const refreshAnswersCount = async (roomId: string, questionId: string) => {
    const { count } = await supabase.from("answers")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId).eq("question_id", questionId);
    setAnswersCountCurrent(count ?? 0);
  };
  const refreshLeaderboard = async (roomId: string) => {
    const { data } = await supabase
      .from("leaderboard_view").select("*").eq("room_id", roomId).order("rank", { ascending: true });
    setLeaderboard((data || []) as LeaderboardRow[]);
  };

  // Actions
  const startFrom = async (order: number) => {
    if (!room) return;
    const secret = adminSecret.trim();
    if (!secret) { alert("Nhập admin secret đã dùng khi mở phòng"); return; }
    const { error } = await supabase.rpc("admin_start_question", {
      p_room_code: room.room_code, p_admin_secret: secret, p_question_order: order
    });
    if (error) alert(error.message);
  };
  const next = async () => {
    if (!room) return;
    const secret = adminSecret.trim();
    const current = room.current_question_order ?? 0;
    const { error } = await supabase.rpc("admin_start_question", {
      p_room_code: room.room_code, p_admin_secret: secret, p_question_order: current + 1
    });
    if (error) alert(error.message);
  };
  const endGame = async () => {
    if (!room) return;
    const secret = adminSecret.trim();
    const { error } = await supabase.rpc("admin_end_game", {
      p_room_code: room.room_code, p_admin_secret: secret
    });
    if (error) alert(error.message);
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Điều khiển phòng: {roomCode}</h1>
        <div className="card" style={{ background: "#f8fafc" }}>
          <div className="stack">
            <input className="input" placeholder="Nhập admin secret để điều khiển"
              value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => startFrom(1)}>Bắt đầu từ câu 1</button>
              <button className="btn" onClick={next}>Câu tiếp theo</button>
              <button className="btn" onClick={endGame}>Kết thúc</button>
            </div>
            <div><strong>Trạng thái:</strong> {room ? `${room.status} — Câu hiện tại: ${room.current_question_order ?? "-"}` : "đang tải…"}</div>
          </div>
          {question && (
            <div className="card" style={{ marginTop: 12 }}>
              <div><strong>Câu {question.order}</strong> — Thời gian: {question.time_limit_sec}s</div>
              <div>{question.content}</div>
            </div>
          )}
          {room && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4>Tiến trình</h4>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div><strong>Số người tham gia:</strong> {participantsCount}</div>
                <div><strong>Đã trả lời câu hiện tại:</strong> {answersCountCurrent}/{participantsCount}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ background: "#f1f5f9" }}>
          <h3>Leaderboard (live)</h3>
          {!room?.id && <p>Đang tải…</p>}
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
                  {leaderboard.length === 0 && <tr><td colSpan={3}>Chưa có điểm.</td></tr>}
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
          <div style={{ fontSize: 12, color: "#64748b" }}>* Tự cập nhật khi có điểm mới.</div>
        </div>
      </div>
    </div>
  );
}
