import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfferSlots,bindNegotiatedMedia,trackRole} from '../app/rtc-media.ts';
import {routeAudio} from '../app/audio-output.ts';
function stream(name,screen=false){const audio={id:name+'-audio',kind:'audio'},video={id:name+'-video',kind:'video'};return {getAudioTracks:()=>[audio],getVideoTracks:()=>screen?[video]:[]}}
function pc(){return {slots:[],getTransceivers(){return this.slots},addTransceiver(track,init={}){const kind=typeof track==='string'?track:track.kind;const t={mid:String(this.slots.length),direction:init.direction||'recvonly',receiver:{track:{kind,id:'remote-'+this.slots.length}},sender:{track:typeof track==='string'?null:track,async replaceTrack(t){this.track=t},setStreams(...s){this.streams=s}}};this.slots.push(t);return t},receiveOffer(other){for(const slot of other.slots)this.addTransceiver(slot.receiver.track.kind,{direction:'recvonly'})}}}
test('3 participants: every answering peer sends its microphone through the offered audio slot',async()=>{
 const people=['Alice','Bruno','Clara'];
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
  const a=pc(),b=pc(),aMic=stream(people[i]),bMic=stream(people[j]);
  createOfferSlots(a,aMic);await bindNegotiatedMedia(a,aMic,null);
  assert.equal(b.slots.length,0,'answerer has no unpaired pre-created slots');
  b.receiveOffer(a);await bindNegotiatedMedia(b,bMic,null);
  assert.equal(a.slots.length,3);assert.equal(b.slots.length,3);
  assert.equal(a.slots[0].sender.track,aMic.getAudioTracks()[0]);
  assert.equal(b.slots[0].sender.track,bMic.getAudioTracks()[0]);
  assert.equal(b.slots[0].direction,'sendrecv');
  assert.deepEqual(b.slots[0].sender.streams,[bMic]);
 }
});
test('Screen renegotiation and stopping screen never replace the microphone slot',async()=>{
 const p=pc(),mic=stream('mic'),screen=stream('share',true);createOfferSlots(p,mic);
 await bindNegotiatedMedia(p,mic,screen);
 assert.equal(p.slots[0].sender.track,mic.getAudioTracks()[0]);
 assert.equal(p.slots[1].sender.track,screen.getVideoTracks()[0]);
 assert.equal(p.slots[2].sender.track,screen.getAudioTracks()[0]);
 await bindNegotiatedMedia(p,mic,null);assert.equal(p.slots.length,3);
 assert.equal(p.slots[0].sender.track,mic.getAudioTracks()[0]);assert.equal(p.slots[1].sender.track,null);assert.equal(p.slots[2].sender.track,null);
 const replacement=stream('replacement');await bindNegotiatedMedia(p,replacement,null);assert.equal(p.slots[0].sender.track,replacement.getAudioTracks()[0]);
});
test('Track classification uses negotiated receiver/MID even with distinct JS wrappers',()=>{
 const p=pc();createOfferSlots(p,stream('mic'));
 assert.equal(trackRole(p,{track:{kind:'audio'},receiver:{},transceiver:{mid:'0'}}),'voice');
 assert.equal(trackRole(p,{track:{kind:'audio'},receiver:{},transceiver:{mid:'2'}}),'screen-audio');
 assert.equal(trackRole(p,{track:{kind:'video'},receiver:{},transceiver:{mid:'1'}}),'screen-video');
});
test('Missing output device falls back to system default, supported output is preserved',async()=>{
 const attempts=[];const el={async setSinkId(id){attempts.push(id);if(id==='removed')throw Error('NotFoundError')}};
 assert.equal(await routeAudio(el,'removed'),true);assert.deepEqual(attempts,['removed','']);
 attempts.length=0;assert.equal(await routeAudio(el,'headphones'),false);assert.deepEqual(attempts,['headphones']);
 assert.equal(await routeAudio({},'headphones'),false);
});
test('Failure of both chosen and default output is surfaced instead of silently ignored',async()=>{
 await assert.rejects(routeAudio({async setSinkId(){throw Error('NotAllowedError')}},'headphones'),/NotAllowedError/);
});
