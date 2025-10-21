import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import "/src/styles.css";
import { supabase } from "../lib/supabaseClient";
import type { Room, Question, Option, Participant, UUID } from "../types";

function useRoomsSubscription(roomCode: string, onChange: (r: Room) => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`room_play_${roomCode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` },
        (payload) => { if (payload.new) onChange(payload.new as Room); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomCode, onChange]);
}

export default function Play() {
  const { roomCode = "" } = useParams();
  const [nickname] = useState<string>(() => localStorage.getItem("apq:nickname") ?? "Khách");
  const [clientId] = useState<UUID>(() => {
    let id = localStorage.getItem("apq:client_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("apq:client_id", id); }
    return id as UUID;
  });

  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<UUID | null>(null);
  const [answering, setAnswering] = useState(false);
  const timerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);

  // 1) Subscribe rooms NGAY LẬP TỨC để kịp bắt sự kiện "bắt đầu câu 1"
  useRoomsSubscription(roomCode, (r) => setRoom(r));

  // 2) Tải room hiện tại & join
  useEffect(() => {
    (async () => {
      const { data: r } = await supabase.from("rooms").select("*").eq("room_code", roomCode).single();
      if (r) setRoom(r as Room);

      // Join (idempotent — nếu đã join trước đó, RPC có thể báo lỗi; ta bỏ qua)
      const { data: p } = await supabase.rpc("join_room", {
        p_room_code: roomCode, p_nickname: nickname, p_client_id: clientId
      });
      if (p) setParticipant(p as Participant);
    })();

    // Polling nhẹ: trong 20s đầu, mỗi 1s refetch room 1 lần (phòng khi socket bị block)
    pollRef.current = window.setInterval(async () => {
      const { data: r } = await supabase.from("rooms").select("*").eq("room_code", roomCode).single();
      if (r) setRoom(r as Room);
    }, 1000);
    // Tự tắt polling sau 20s
    const stop = window.setTimeout(() => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    }, 20000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.clearTimeout(stop);
    };
  }, [roomCode, nickname, clientId]);

  // 3) Khi room đổi → tải câu/option + setup timer
  useEffect(() => {
    (async () => {
      if (!room?.current_question_id || room.status !== "running") {
        setQuestion(null); setOptions([]); setRemainingMs(0); setSelectedOption(null);
        if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
        return;
      }

      // Load question
      const { data: q } = await supabase
        .from("questions")
        .select("id, quiz_id, order, content, time_limit_sec")
        .eq("id", room.current_question_id).single();
      if (!q) return;
      setQuestion(q as Question);

      // Load options
      const { data: opts } = await supabase
        .from("options").select("*")
        .eq("question_id", room.current_question_id)
        .order("label", { ascending: true });
      setOptions((opts || []) as Option[]);

      // Timer theo question_start_at
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      const startAt = room.question_start_at ? new Date(room.question_start_at).getTime() : Date.now();
      const total = (q as Question).time_limit_sec * 1000;

      const tick = () => {
        const now = Date.now();
        const elapsed = now - startAt;
        const remain = Math.max(0, total - elapsed);
        setRemainingMs(remain);
        if (remain <= 0 && timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      };
      setSelectedOption(null);
      tick();
      timerRef.current = window.setInterval(tick, 200);
    })();
  }, [room?.current_question_id, room?.question_start_at, room?.current_question_order, room?.status]);

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  const secondsLeft = useMemo(() => Math.ceil(remainingMs / 1000), [remainingMs]);

  const handleSubmit = async (optionId: UUID) => {
    if (!participant || !room || !question) return;
    if (answering || secondsLeft <= 0) return;
    setAnswering(true);
    setSelectedOption(optionId);
    try {
      const latency = question.time_limit_sec * 1000 - remainingMs;
      await supabase.rpc("submit_answer", {
        p_room_code: room.room_code,
        p_participant_id: participant.id,
        p_question_id: question.id,
        p_option_id: optionId,
        p_latency_ms: Math.max(0, latency),
      });
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Phòng: {roomCode}</h1>
        <p>Xin chào <strong>{nickname}</strong></p>

        {(!room || room.status === "waiting") && (
          <div className="card" style={{ background: "#f1f5f9" }}>
            <h3>Đang chờ Admin bắt đầu…</h3>
            <p>Khi Admin phát câu hỏi, màn hình sẽ hiển thị tự động.</p>
          </div>
        )}

        {room && room.status === "running" && question && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Câu {question.order}</h2>
              <div style={{ fontWeight: 800 }}>⏳ {Math.max(0, secondsLeft)}s</div>
            </div>
            <p style={{ fontSize: 18 }}>{question.content}</p>

            <div className="stack">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  className="btn"
                  disabled={answering || selectedOption !== null || secondsLeft <= 0}
                  onClick={() => handleSubmit(opt.id)}
                  style={{ textAlign: "left" }}
                >
                  <strong>{opt.label}.</strong> {opt.content}
                </button>
              ))}
            </div>

            {selectedOption && (
              <p style={{ marginTop: 8, color: "#475569" }}>
                Đã gửi lựa chọn. Chờ hết giờ hoặc câu tiếp theo.
              </p>
            )}
          </div>
        )}

        {room && room.status === "ended" && (
          <div className="card">
            <h3>Trò chơi đã kết thúc.</h3>
            <p>Xem bảng xếp hạng tại <code>/leaderboard/{roomCode}</code>.</p>
          </div>
        )}
      </div>
    </div>
  );
}
