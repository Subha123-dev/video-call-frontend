import React, { useEffect, useRef, useState } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import { io } from "socket.io-client";

// ---------------- AGORA APP ID ----------------
const APP_ID = "0013df50016b40d4995a8468c4fd44e5";

// ---------------- BACKEND URL ----------------
const BACKEND_URL =
  "https://video-call-backend-z7c1.onrender.com";

// ---------------- AGORA CLIENT ----------------
const client = AgoraRTC.createClient({
  mode: "rtc",
  codec: "vp8",
});

export default function Meeting() {
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [joined, setJoined] = useState(false);

  const [localTracks, setLocalTracks] = useState([]);
  const [remoteUsers, setRemoteUsers] = useState([]);

  const socketRef = useRef(null);
  const localRef = useRef(null);

  // ---------------- AUTO ROOM FROM URL ----------------
  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );
    const room = params.get("room");
    if (room) setRoomId(room);
  }, []);

  // ---------------- CREATE ROOM ----------------
  const createRoom = () => {
    const id = Math.random()
      .toString(36)
      .substring(2, 8);
    setRoomId(id);
    alert("Room Created: " + id);
  };

  // ---------------- COPY LINK ----------------
  const copyLink = () => {
    const link = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    alert("Copied: " + link);
  };

  // ---------------- JOIN ROOM ----------------
  const joinRoom = async () => {
    if (joined) {
      alert("Already joined");
      return;
    }

    if (!roomId || !userName) {
      alert("Enter Room ID & Name");
      return;
    }

    try {
      const uid = Math.floor(
        Math.random() * 100000
      );

      // SOCKET
      socketRef.current = io(BACKEND_URL);
      socketRef.current.emit("join-room", {
        roomId,
        userName,
      });

      // TOKEN
      const res = await fetch(
        `${BACKEND_URL}/getToken?channelName=${roomId}&uid=${uid}`
      );

      const data = await res.json();

      // JOIN AGORA
      await client.join(
        APP_ID,
        roomId,
        data.token,
        uid
      );

      // CREATE MIC + CAM TRACKS
      const tracks =
        await AgoraRTC.createMicrophoneAndCameraTracks();

      setLocalTracks(tracks);

      // PLAY LOCAL VIDEO
      tracks[1].play(localRef.current);

      // PUBLISH
      await client.publish(tracks);

      setJoined(true);
    } catch (err) {
      console.error(err);
      alert("Join failed");
    }
  };

  // ---------------- LEAVE ----------------
  const leaveRoom = async () => {
    localTracks.forEach((t) => {
      t.stop();
      t.close();
    });

    await client.leave();

    if (socketRef.current)
      socketRef.current.disconnect();

    setJoined(false);
    setRemoteUsers([]);
  };

  // ---------------- MIC ----------------
  const toggleMic = async () => {
    if (!localTracks[0]) return;

    await localTracks[0].setEnabled(
      !localTracks[0].enabled
    );
  };

  // ---------------- CAMERA ----------------
  const toggleCam = async () => {
    if (!localTracks[1]) return;

    await localTracks[1].setEnabled(
      !localTracks[1].enabled
    );
  };

  // ---------------- SCREEN SHARE ----------------
  const shareScreen = async () => {
    try {
      // CREATE SCREEN TRACK
      const screenTrack =
        await AgoraRTC.createScreenVideoTrack();

      // UNPUBLISH CAMERA
      await client.unpublish(localTracks[1]);
      localTracks[1].stop();

      // PUBLISH SCREEN
      await client.publish(screenTrack);
      screenTrack.play(localRef.current);

      // WHEN SCREEN STOPPED
      screenTrack.on(
        "track-ended",
        async () => {
          await client.unpublish(screenTrack);

          // RECREATE CAMERA (mobile fix)
          const camTrack =
            await AgoraRTC.createCameraVideoTrack();

          localTracks[1] = camTrack;

          await client.publish(camTrack);
          camTrack.play(localRef.current);
        }
      );
    } catch (err) {
      console.error(err);
      alert("Screen share failed");
    }
  };

  // ---------------- AGORA EVENTS ----------------
  useEffect(() => {
    client.on(
      "user-published",
      async (user, mediaType) => {
        await client.subscribe(
          user,
          mediaType
        );

        if (mediaType === "video") {
          setRemoteUsers((prev) => [
            ...prev,
            user,
          ]);
        }

        if (mediaType === "audio") {
          user.audioTrack.play();
        }
      }
    );

    client.on("user-left", (user) => {
      setRemoteUsers((prev) =>
        prev.filter(
          (u) => u.uid !== user.uid
        )
      );
    });
  }, []);

  // PLAY REMOTE
  useEffect(() => {
    remoteUsers.forEach((user) => {
      if (user.videoTrack) {
        user.videoTrack.play(
          `remote-${user.uid}`
        );
      }
    });
  }, [remoteUsers]);

  // ---------------- UI ----------------
  return (
    <div
      style={{
        background: "#111",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <h2 style={{ textAlign: "center" }}>
        Meeting Room
      </h2>

      {!joined ? (
        <div style={{ textAlign: "center" }}>
          <input
            placeholder="Your Name"
            value={userName}
            onChange={(e) =>
              setUserName(e.target.value)
            }
          />

          <br />
          <br />

          <button onClick={createRoom}>
            Create Room
          </button>

          <br />
          <br />

          <input
            placeholder="Room ID"
            value={roomId}
            onChange={(e) =>
              setRoomId(e.target.value)
            }
          />

          <br />
          <br />

          <button
            onClick={joinRoom}
            disabled={joined}
          >
            Join Meeting
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(300px,1fr))",
              gap: "5px",
              padding: "5px",
            }}
          >
            {/* LOCAL */}
            <div
              ref={localRef}
              style={{
                height: "300px",
                background: "#000",
              }}
            />

            {/* REMOTE */}
            {remoteUsers.map((user) => (
              <div
                key={user.uid}
                id={`remote-${user.uid}`}
                style={{
                  height: "300px",
                  background: "#000",
                }}
              />
            ))}
          </div>

          <div
            style={{
              textAlign: "center",
              marginTop: 10,
            }}
          >
            <button onClick={toggleMic}>
              Toggle Mic
            </button>

            <button onClick={toggleCam}>
              Toggle Cam
            </button>

            <button onClick={shareScreen}>
              Share Screen
            </button>

            <button onClick={copyLink}>
              Copy Link
            </button>

            <button onClick={leaveRoom}>
              Leave
            </button>
          </div>
        </>
      )}
    </div>
  );
}
