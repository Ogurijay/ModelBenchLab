import { randomGenerator } from './spectrum.js';
export class SeaAudio {
  constructor(){this.enabled=false;this.context=null;}
  async toggle(){
    if(this.enabled){this.enabled=false;await this.context.suspend();return false;}
    if(!this.context){
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw new Error('当前浏览器不支持海浪声');
      this.context=new Context();const c=this.context,buffer=c.createBuffer(1,c.sampleRate*6,c.sampleRate),samples=buffer.getChannelData(0),random=randomGenerator(618);
      let brown=0;for(let i=0;i<samples.length;i++){brown=(brown+(random()*2-1)*0.045)/1.02;samples[i]=brown;}
      this.source=c.createBufferSource();this.source.buffer=buffer;this.source.loop=true;
      this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=1200;this.filter.Q.value=0.5;
      this.gain=c.createGain();this.gain.gain.value=0.2;this.source.connect(this.filter);this.filter.connect(this.gain);this.gain.connect(c.destination);this.source.start();
    }
    await this.context.resume();this.enabled=true;return true;
  }
  update(time,wind){if(!this.enabled)return;const now=this.context.currentTime;this.gain.gain.setTargetAtTime((0.22+wind*0.01)*(0.7+0.3*Math.sin(time*0.5)),now,0.4);this.filter.frequency.setTargetAtTime(650+wind*55,now,0.4);}
  dispose(){this.source?.stop();this.context?.close();}
}
