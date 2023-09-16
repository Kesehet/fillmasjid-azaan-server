const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const fs = require('fs');
const https = require('https');

const cors = require('cors');



class Broadcast{
    constructor(adminStream,connectionID){
        adminStream = adminStream;
        this.connectionID = connectionID;
    }
}


class StreamObject{
    constructor(connectionID,sdp){
       this.peer =  new webrtc.RTCPeerConnection({iceServers: cherry});
       this.desc = new webrtc.RTCSessionDescription(sdp);
       this.connectionID = connectionID;
       this.load()
    }

    async load(){
        this.peer.setRemoteDescription(this.desc)
        .then(() => {
            return this.peer.createAnswer();
        })
        .then((answer) => {
            return this.peer.setLocalDescription(answer);
        })
        .catch((error) => {
            console.error(error);
        });
    }
    response(){
        return {
            sdp: this.peer.localDescription,
            connectionID: this.connectionID
        }
    }

}




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
	
	const stream = new StreamObject(body.connectionID,body.sdp);
    stream.load();
    res.json(stream.response());
	return;
    const peer = new webrtc.RTCPeerConnection({iceServers: cherry});
    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);
	
	var streamNow = senderStream[body.connectionID];
	if(streamNow == undefined){
		res.json({})
        return
	}


	
    streamNow.getTracks().forEach(track => peer.addTrack(track, streamNow));

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const payload = {sdp: peer.localDescription};
    res.json(payload);
});

app.post('/broadcast', async ({ body }, res) => {
    const stream = new StreamObject(body.connectionID,body.sdp);
    stream.load();
    res.json(stream.response());
	return;

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

function handleTrackEvent(e, peer, connID) {
    senderStream[connID] = e.streams[0];
}

var server = https.createServer(options, app);
server.listen(443,'0.0.0.0', () => console.log('server started'));