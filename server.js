const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const fs = require('fs');
const https = require('https');

const cors = require('cors');
app.use(cors({
    origin: 'https://app.fillmasjid.in'
}));



let senderStream = {};
var cherry =[
    {
        urls: "turn:72.235.112.32:8443",
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
	
    streamNow.getTracks().forEach(track => peer.addTrack(track, streamNow));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const payload = {sdp: peer.localDescription};
    res.json(payload);
});

app.post('/broadcast', async ({ body }, res) => {
    const peer = new webrtc.RTCPeerConnection({iceServers: cherry});
	
    peer.ontrack = (e) => handleTrackEvent(e, peer,body.connectionID);
	
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

function handleTrackEvent(e, peer,connID) {
    senderStream[connID] = e.streams[0];
};

var server = https.createServer(options, app);
server.listen(443,'0.0.0.0', () => console.log('server started'));