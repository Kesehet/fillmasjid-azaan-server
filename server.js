const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const fs = require('fs');
const https = require('https');

const cors = require('cors');





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


var Broadcasts = {};


class Broadcast{
    constructor(connectionID){
        this.connectionID = connectionID;
        this.adminStream = null;
        this.consumerStreams = {};
    }
    addAdminStream(stream){
        this.adminStream = stream;
    }
    addConsumerStream(stream){
        stream.AttachTrackToListen(this.adminStream.track);
        // if (this.consumerStreams[stream.version] != undefined) {
        //     this.consumerStreams[stream.version].cleanup();
        //     this.consumerStreams[stream.version] = null;
        // }
        this.consumerStreams[stream.version] = stream;
    }

}


class StreamObject {
    constructor(connectionID, sdp, version,type ="consumer") {
        this.peer = new webrtc.RTCPeerConnection({ iceServers: cherry });
        this.desc = new webrtc.RTCSessionDescription(sdp);
        this.connectionID = connectionID;
        this.version = version;
        this.answer = null;
        this.track = null;
        this.rand = (Math.random() + 1).toString(36).substring(7);   
        this.type=type;
        // Add event listeners
        this.addEventListeners();

        if(!sdp.type){
         sdp = this.convertSDP(sdp);   
        }
        console.log(sdp);
        // Set the remote description and wait for the correct state to load
        this.peer.setRemoteDescription(sdp);
                
        this.peer.ontrack = (e) => this.handleBroadcastStreamGetter(e);

    }

    convertSDP(sdpString) {
        return {
          type: 'offer',
          sdp: `${sdpString}`
        };
      }

    addEventListeners() {
        this.peer.onicecandidate = (event) => {
            if (event.candidate) {
                //console.log('New ICE candidate:', event.candidate);
                // You can send this candidate to the other peer if needed
            }
        };
        this.peer.onsignalingstatechange = () => {
            //console.log('peer.onsignalingstatechange ' + this.peer.signalingState);
            if (this.peer.signalingState === 'have-remote-offer') {
                this.load();
            }
        };

        this.peer.oniceconnectionstatechange = () => {
            console.log('peer.oniceconnectionstatechange ' + this.peer.iceConnectionState);
            if (this.peer.iceConnectionState === 'disconnected' || this.peer.iceConnectionState === 'failed' || this.peer.iceConnectionState === 'closed') {
                this.cleanup();
            }
        };

        this.peer.onerror = (error) => {
            console.error('RTCPeerConnection error:', error);
        };
    }

async load() {
    try {
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
    } catch (error) {
        console.error("Error in load method:", error);
    }
}
    cleanup() {
        // Close the RTCPeerConnection
        this.peer.close();
        if(this.type=="admin"){
            delete Broadcasts[this.connectionID];
        }
        console.log('StreamObject resources released.');
    }

    response() {
        return {
            sdp: this.peer.localDescription,
            connectionID: this.connectionID,
            version:this.version
        };
    }

    handleBroadcastStreamGetter(e){
        this.track = e.streams[0];
    }

    AttachTrackToListen(admintrack){
        admintrack.getTracks().forEach(track => this.peer.addTrack(track, admintrack));
    }

}







app.post("/consumer", async ({ body }, res) => {
    
    if(!Broadcasts[body.connectionID]){
        res.json({})
        return
    }
	const stream = new StreamObject(body.connectionID,body.sdp,body.version);
    Broadcasts[body.connectionID].addConsumerStream(stream);
    await stream.load();
    res.json(stream.response());

    console.log(`
    Consumers => ${Object.keys(Broadcasts[body.connectionID].consumerStreams).length}
    Admin => ${Broadcasts[body.connectionID].adminStream.connectionID}
    `);
});

app.post('/broadcast', async ({ body }, res) => {

    const broadcast = new Broadcast(body.adminStream,body.connectionID);

    const stream = new StreamObject(body.connectionID,body.sdp,body.version,type="admin");
    await stream.load();
    broadcast.addAdminStream(stream);
    Broadcasts[stream.connectionID] = broadcast;
    res.json(stream.response());

	return;

});

app.get('/broadcast', async (req, res) => {
    let ret = {};

    // Check if Broadcasts object is not empty
    if(Object.keys(Broadcasts).length > 0){
        // for each broadcast, get the list of consumers
        for(let broadcast in Broadcasts){
            let ret2 = [];

            // Check if consumerStreams array is not empty
            if(Object.keys(Broadcasts[broadcast].consumerStreams).length > 0){
                Object.keys(Broadcasts[broadcast].consumerStreams).forEach((streamKey) => {
                    // Check if version property exists in stream object    
                    let stream = Broadcasts[broadcast].consumerStreams[streamKey];
                    if(stream.hasOwnProperty('version')){
                        ret2.push({
                            connectionID: stream.connectionID,
                            version: stream.version,
                            state: stream.peer.connectionState,
                            randomID: stream.rand 
                        });
                    }
                    else{
                        console.log("No version property");
                    }
                });

                ret[broadcast] = ret2;
            }
            else{
                ret[broadcast] = [];
                console.log("No consumers available");
            }
        }
    }
    else{
        // Handle case when Broadcasts object is empty
        console.log("No broadcasts available");
    }
    console.log(ret);

    res.json(ret);
})




var server = https.createServer(options, app);
server.listen(443,'0.0.0.0', () => console.log('server started'));