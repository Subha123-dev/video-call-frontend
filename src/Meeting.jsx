import React, { useEffect, useRef, useState } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import { io } from "socket.io-client";

const APP_ID = "0013df50016b40d4995a8468c4fd44e5";

// ⚠️ If you use ngrok for backend, change this URL
const BACKEND_URL = "https://video-call-backend-z7c1.onrender.com/";

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export default function Meeting() {
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [joined, setJoined] = useState(false);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const [localTracks, setLocalTracks] = useState([]);
  const [remoteUsers, setRemoteUsers] = useState([]);

  const [participants, setParticipants] = useState([]);
  const [hostId, setHostId] = useState("");

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState([]);

  const socketRef = useRef(null);
  const localPlayerRef = useRef(null);

  // ✅ Auto set room from URL like ?room=abcd12
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get("room");
    if (roomFromUrl) setRoomId(roomFromUrl);
  }, []);

  // -------------------- CREATE ROOM --------------------
  const createRoom = () => {
    const randomRoom = Math.random().toString(36).substring(2, 8);
    setRoomId(randomRoom);
    alert("Room Created: " + randomRoom);
  };

  // -------------------- COPY ROOM LINK --------------------
  const copyLink = () => {
    const link = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    alert("Room Link Copied:\n" + link);
  };

  // -------------------- JOIN ROOM --------------------
  const joinRoom = async () => {
    if (!roomId || !userName) return alert("Enter Room ID and Name");

    try {
      const uid = Math.floor(Math.random() * 100000);

      // Socket connect
      socketRef.current = io(BACKEND_URL);

      socketRef.current.emit("join-room", { roomId, userName });

      socketRef.current.on("participants", (users) => setParticipants(users));
      socketRef.current.on("host-info", (id) => setHostId(id));

      socketRef.current.on("chat-message", (data) => {
        setChatMessages((prev) => [...prev, data]);
      });

      socketRef.current.on("kicked", () => {
        alert("You are kicked by host!");
        leaveRoom();
      });

      socketRef.current.on("meeting-ended", () => {
        alert("Host ended the meeting!");
        leaveRoom();
      });

      // Fetch token from backend
      const res = await fetch(
        `${BACKEND_URL}/getToken?channelName=${roomId}&uid=${uid}`
      );
      const data = await res.json();

      const token = data.token;

      // Join Agora
      await client.join(APP_ID, roomId, token, uid);

      // Create mic + camera tracks
      const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
      setLocalTracks(tracks);

      // Play local video
      tracks[1].play(localPlayerRef.current);

      // Publish local tracks
      await client.publish(tracks);

      setJoined(true);
    } catch (error) {
      console.log(error);
      alert("Join failed. Check console.");
    }
  };

  // -------------------- LEAVE ROOM --------------------
  const leaveRoom = async () => {
    try {
      localTracks.forEach((t) => t.close());
      await client.leave();

      if (socketRef.current) socketRef.current.disconnect();

      setJoined(false);
      setRemoteUsers([]);
      setParticipants([]);
      setChatMessages([]);
      setChatOpen(false);
      setMicOn(true);
      setCamOn(true);
      setScreenSharing(false);
    } catch (error) {
      console.log(error);
    }
  };

  // -------------------- MIC CONTROL --------------------
  const toggleMic = async () => {
    if (!localTracks[0]) return;
    await localTracks[0].setEnabled(!micOn);
    setMicOn(!micOn);
  };

  // -------------------- CAMERA CONTROL --------------------
  const toggleCam = async () => {
    if (!localTracks[1]) return;
    await localTracks[1].setEnabled(!camOn);
    setCamOn(!camOn);
  };

  // -------------------- SCREEN SHARE --------------------
  const startScreenShare = async () => {
    try {
      const screenTrack = await AgoraRTC.createScreenVideoTrack();

      await client.unpublish(localTracks[1]);
      localTracks[1].stop();

      await client.publish(screenTrack);
      screenTrack.play(localPlayerRef.current);

      setScreenSharing(true);

      screenTrack.on("track-ended", async () => {
        await client.unpublish(screenTrack);
        await client.publish(localTracks[1]);
        localTracks[1].play(localPlayerRef.current);

        setScreenSharing(false);
      });
    } catch (error) {
      console.log(error);
      alert("Screen Share Failed!");
    }
  };

  // -------------------- CHAT SEND --------------------
  const sendMessage = () => {
    if (!chatMessage.trim()) return;

    socketRef.current.emit("chat-message", {
      roomId,
      message: chatMessage,
      userName,
    });

    setChatMessage("");
  };

  // -------------------- HOST CONTROLS --------------------
  const kickUser = (userId) => {
    socketRef.current.emit("kick-user", { roomId, userId });
  };

  const endMeeting = () => {
    socketRef.current.emit("end-meeting", { roomId });
  };

  // -------------------- AGORA EVENTS --------------------
  useEffect(() => {
    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);

      if (mediaType === "video") {
        setRemoteUsers((prev) => [...prev, user]);
      }

      if (mediaType === "audio") {
        user.audioTrack.play();
      }
    });

    client.on("user-left", (user) => {
      setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
    });
  }, []);

  useEffect(() => {
    remoteUsers.forEach((user) => {
      if (user.videoTrack) {
        user.videoTrack.play(`remote-${user.uid}`);
      }
    });
  }, [remoteUsers]);

  // -------------------- UI --------------------
  return (
    <div style={styles.main}>
      <h2 style={styles.header}>Google Meet Style Video Call</h2>

      {!joined ? (
        <div style={styles.joinBox}>
          <input
            style={styles.input}
            placeholder="Enter Your Name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />

          <button style={styles.button} onClick={createRoom}>
            Create Room
          </button>

          <input
            style={styles.input}
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />

          <button style={{ ...styles.button, background: "green" }} onClick={joinRoom}>
            Join Meeting
          </button>
        </div>
      ) : (
        <>
          {/* VIDEO GRID */}
          <div style={styles.videoGrid}>
            <div style={styles.videoTile}>
              <div ref={localPlayerRef} style={styles.video}></div>
              <p style={styles.nameTag}>You ({userName})</p>
            </div>

            {remoteUsers.map((user) => (
              <div key={user.uid} style={styles.videoTile}>
                <div id={`remote-${user.uid}`} style={styles.video}></div>
                <p style={styles.nameTag}>User: {user.uid}</p>
              </div>
            ))}
          </div>

          {/* CONTROLS BAR */}
          <div style={styles.controlsBar}>
            <button style={styles.controlBtn} onClick={toggleMic}>
              {micOn ? "🎤 Mute" : "🔇 Unmute"}
            </button>

            <button style={styles.controlBtn} onClick={toggleCam}>
              {camOn ? "📷 Camera Off" : "📷 Camera On"}
            </button>

            <button style={styles.controlBtn} onClick={startScreenShare}>
              {screenSharing ? "🖥 Sharing..." : "🖥 Share Screen"}
            </button>

            <button style={styles.copyBtn} onClick={copyLink}>
              🔗 Copy Link
            </button>

            <button style={styles.controlBtn} onClick={() => setChatOpen(!chatOpen)}>
              💬 Chat
            </button>

            <button style={styles.leaveBtn} onClick={leaveRoom}>
              ❌ Leave
            </button>
          </div>

          {/* CHAT PANEL */}
          {chatOpen && (
            <div style={styles.chatPanel}>
              <h3 style={{ margin: "5px 0" }}>Chat</h3>

              <div style={styles.chatBox}>
                {chatMessages.map((msg, idx) => (
                  <p key={idx}>
                    <b>{msg.userName}:</b> {msg.message}
                  </p>
                ))}
              </div>

              <div style={{ display: "flex", gap: "5px" }}>
                <input
                  style={styles.chatInput}
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Type message..."
                />

                <button style={styles.button} onClick={sendMessage}>
                  Send
                </button>
              </div>
            </div>
          )}

          {/* PARTICIPANTS PANEL */}
          <div style={styles.participantsPanel}>
            <h3 style={{ margin: "5px 0" }}>Participants</h3>

            {participants.map((p) => (
              <div key={p.id} style={styles.participantItem}>
                <span>{p.name}</span>

                {socketRef.current?.id === hostId && p.id !== hostId && (
                  <button style={styles.kickBtn} onClick={() => kickUser(p.id)}>
                    Kick
                  </button>
                )}
              </div>
            ))}

            {socketRef.current?.id === hostId && (
              <button style={styles.endBtn} onClick={endMeeting}>
                End Meeting For All
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// -------------------- STYLES --------------------
const styles = {
  main: {
    background: "#111",
    minHeight: "100vh",
    color: "#fff",
    fontFamily: "Arial, sans-serif",
  },

  header: {
    textAlign: "center",
    padding: "10px",
    margin: 0,
  },

  joinBox: {
    marginTop: "50px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    alignItems: "center",
  },

  input: {
    padding: "12px",
    width: "250px",
    borderRadius: "8px",
    border: "none",
    outline: "none",
  },

  button: {
    padding: "10px 15px",
    borderRadius: "8px",
    border: "none",
    background: "#555",
    color: "#fff",
    cursor: "pointer",
    fontSize: "15px",
  },

  videoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gridAutoRows: "minmax(250px, 1fr)",
    gap: "6px",
    padding: "6px",
    height: "calc(100vh - 80px)",
  },

  videoTile: {
    position: "relative",
    background: "#000",
    borderRadius: "8px",
    overflow: "hidden",
  },

  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },

  nameTag: {
    position: "absolute",
    bottom: "8px",
    left: "8px",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    padding: "3px 8px",
    borderRadius: "5px",
    fontSize: "14px",
  },

  controlsBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "12px",
    padding: "10px",
    background: "rgba(0,0,0,0.8)",
    zIndex: 999,
    flexWrap: "wrap",
  },

  controlBtn: {
    padding: "10px 14px",
    background: "#444",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  },

  leaveBtn: {
    padding: "10px 14px",
    background: "red",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  },

  copyBtn: {
    padding: "10px 14px",
    background: "blue",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  },

  chatPanel: {
    position: "fixed",
    right: "10px",
    bottom: "80px",
    width: "320px",
    height: "420px",
    background: "#222",
    padding: "10px",
    borderRadius: "10px",
    zIndex: 1000,
    boxShadow: "0px 0px 10px rgba(0,0,0,0.5)",
  },

  chatBox: {
    height: "320px",
    overflowY: "auto",
    border: "1px solid gray",
    padding: "8px",
    marginBottom: "8px",
    borderRadius: "8px",
    background: "#111",
  },

  chatInput: {
    flex: 1,
    padding: "8px",
    borderRadius: "8px",
    border: "none",
    outline: "none",
  },

  participantsPanel: {
    position: "fixed",
    left: "10px",
    bottom: "80px",
    width: "220px",
    background: "#222",
    padding: "10px",
    borderRadius: "10px",
    zIndex: 1000,
    boxShadow: "0px 0px 10px rgba(0,0,0,0.5)",
  },

  participantItem: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
    background: "#111",
    padding: "6px",
    borderRadius: "6px",
    fontSize: "14px",
  },

  kickBtn: {
    background: "orange",
    border: "none",
    padding: "4px 8px",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "12px",
  },

  endBtn: {
    background: "red",
    color: "#fff",
    border: "none",
    padding: "8px",
    borderRadius: "8px",
    marginTop: "10px",
    cursor: "pointer",
    width: "100%",
  },
};
