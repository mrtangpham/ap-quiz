import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "/src/styles.css";
import { supabase } from "../lib/supabaseClient";
import type { LeaderboardRow, Room } from "../types";

export default function Leaderboard() {
  const { roomCode = "" } = useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: r, error: er } = await supabase
        .from("rooms")
        .select("*")
        .eq("room_code", roomCode)
        .single();
      if (er || !r) {
        alert("Không tìm thấy phòng");
        return;
      }
      setRoom(r as Room);
      await fetchLeaderboard((r as Room).id);
    })();
  }, [roomCode]);

  useEffect(() => {
    if (!room?.id) return;
    const channel = supabase
      .channel(`scores_${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scores", filter: `room_id=eq.${room.id}` },
        async () => {
          await fetchLeaderboard(room.id);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id]);

  const fetchLeaderboard = async (roomId: string) => {
    const { data, error } = await supabase
      .from("leaderboard_view")
      .select("*")
      .eq("room_id", roomId)
      .order("rank", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setRows(data as LeaderboardRow[]);
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Leaderboard — Phòng: {roomCode}</h1>

        {room && (
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
                {rows.length === 0 && <tr><td colSpan={3}>Chưa có điểm.</td></tr>}
                {rows.map((r) => (
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

        {!room && <p>Đang tải…</p>}
      </div>
    </div>
  );
}
