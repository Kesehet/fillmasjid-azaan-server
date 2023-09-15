const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const fs = require('fs');
const https = require('https');

const cors = require('cors');




let senderStream = {};
const STREAM_TIMEOUT = 5 * 60 * 1000; // 5 minutes
let streamTimeouts = {};

var cherry =[
    {
        urls: "turn:74.235.112.32:3478",
        username: "any",
        credential: "any",
      },
    
  ];

var key = fs.readFileSync(__dirname + '/fillmasjid.com.pk');
var cert = fs.readFileSync(__dirname + '/fillmasjid.com.pem');
var options = {
  key: key,
  cert: cert
};

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({origin: 'https://app.fillmasjid.in'}));

app.post("/consumer", async ({ body }, res) => {
	
	
	
    const peer = new webrtc.RTCPeerConnection({iceServers: cherry});
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
	
	var streamNow = senderStream[body.connectionID];
	if(streamNow == undefined){
		res.json({})
	}

        // Reset the timeout for this stream since it's being accessed
        if (streamTimeouts[body.connectionID]) {
            clearTimeout(streamTimeouts[body.connectionID]);
            streamTimeouts[body.connectionID] = setTimeout(() => {
                delete senderStream[body.connectionID];
                delete streamTimeouts[body.connectionID];
                console.log(`Stream with connectionID ${body.connectionID} has been removed due to inactivity.`);
            }, STREAM_TIMEOUT);
        }
	
    streamNow.getTracks().forEach(track => peer.addTrack(track, streamNow));
    const answer = await peer.createAnswer();
    console.log(answer);
    await peer.setLocalDescription(answer);
    const payload = {sdp: peer.localDescription};
    res.json(payload);
});

app.post('/broadcast', async ({ body }, res) => {

    const peer = new webrtc.RTCPeerConnection({iceServers: cherry});
	
    peer.ontrack = (e) => handleTrackEvent(e, peer,body.connectionID);
	console.log(body.sdp);
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const payload = {
        sdp: peer.localDescription,
		connectionID: body.connectionID
    }
    res.json(payload);
});

function handleTrackEvent(e, peer, connID) {
    senderStream[connID] = e.streams[0];

    // Clear any existing timeout for this stream
    if (streamTimeouts[connID]) {
        clearTimeout(streamTimeouts[connID]);
    }

    // Set a new timeout to remove the stream after the specified period
    streamTimeouts[connID] = setTimeout(() => {
        delete senderStream[connID];
        delete streamTimeouts[connID];
        console.log(`Stream with connectionID ${connID} has been removed due to inactivity.`);
    }, STREAM_TIMEOUT);
}

var server = https.createServer(options, app);
server.listen(443,'0.0.0.0', () => console.log('server started'));