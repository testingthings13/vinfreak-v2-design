import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={hasError:false, err:null}; }
  static getDerivedStateFromError(err){ return {hasError:true, err}; }
  componentDidCatch(err, info){ console.error("UI Crash:", err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div style={{padding:16,border:"1px solid #ff8fa3",borderRadius:10,background:"#2a0f1a",color:"#ffdfe6"}}>
          <h2>Something broke in the UI</h2>
          <pre style={{whiteSpace:"pre-wrap",fontSize:12,lineHeight:1.4}}>
            {String(this.state.err?.stack || this.state.err || "Unknown error")}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
