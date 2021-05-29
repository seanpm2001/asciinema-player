import AsciinemaPlayerCore from '../core';
import { batch, createMemo, createState, Match, onCleanup, onMount, reconcile, Switch } from 'solid-js';
import Terminal from './Terminal';
import ControlBar from './ControlBar';
import LoaderOverlay from './LoaderOverlay';
import StartOverlay from './StartOverlay';


export default props => {
  const [state, setState] = createState({
    state: 'initial',
    width: props.cols,
    height: props.rows,
    duration: null,
    lines: [],
    cursor: undefined,
    terminalScale: 1.0,
    showControls: false,
    currentTime: null,
    remainingTime: null,
    progress: null,
    blink: true
  });

  let frameRequestId;
  let userActivityTimeoutId;
  let timeUpdateIntervalId;
  let blinkIntervalId;

  let wrapperRef;
  let terminalRef;

  let resizeObserver;

  const core = AsciinemaPlayerCore.build(props.src, {
    loop: props.loop || false,
    cols: props.cols,
    rows: props.rows
  }, () => onFinish());

  onMount(() => {
    console.log('mounted!');

    setState({
      charW: terminalRef.clientWidth / (state.width || 80),
      charH: terminalRef.clientHeight / (state.height || 24),
      bordersW: terminalRef.offsetWidth - terminalRef.clientWidth,
      bordersH: terminalRef.offsetHeight - terminalRef.clientHeight,
      containerW: wrapperRef.offsetWidth,
      containerH: wrapperRef.offsetHeight
    });

    resizeObserver = new ResizeObserver(_entries => {
      console.log('container resized!')

      setState({
        containerW: wrapperRef.offsetWidth,
        containerH: wrapperRef.offsetHeight
      });
    });

    resizeObserver.observe(wrapperRef);
  });

  onCleanup(() => {
    core.stop()
    stopTimeUpdates();
    cancelAnimationFrame(frameRequestId);
    stopBlinking();
    resizeObserver.disconnect();
  });

  const play = async () => {
    setState('state', 'loading');

    const timeoutId = setTimeout(() => {
      setState('state', 'waiting');
    }, 1000);

    const { width, height, duration } = await core.start();
    clearTimeout(timeoutId);
    setState('state', 'playing');

    if (state.width) {
      setState('duration', duration);
    } else {
      setState({ duration: duration, width: width, height: height });
    }

    frameRequestId = requestAnimationFrame(frame);

    startTimeUpdates();
    startBlinking();
  }

  const pauseOrResume = () => {
    const isPlaying = core.pauseOrResume();

    if (isPlaying) {
      setState('state', 'playing');
      startTimeUpdates();
      startBlinking();
    } else {
      setState('state', 'paused');
      updateTime();
      stopTimeUpdates();
      stopBlinking();
    }
  }

  const frame = () => {
    frameRequestId = requestAnimationFrame(frame);

    const cursor = core.getCursor();
    const changedLines = core.getChangedLines();

    batch(() => {
      setState('cursor', reconcile(cursor));

      if (changedLines.size > 0) {
        changedLines.forEach((line, i) => {
          setState('lines', i, reconcile(line));
        })
      }
    });
  }

  const terminalSize = createMemo(() => {
    console.log('terminalSize');

    if (!state.charW) {
      return {};
    }

    console.log(`containerW = ${state.containerW}`);

    const terminalW = (state.charW * (state.width || 80)) + state.bordersW;
    const terminalH = (state.charH * (state.height || 24)) + state.bordersH;

    if (props.size) {
      let priority = 'width';

      if (props.size == 'fitboth' || !!document.fullscreenElement) {
        const containerRatio = state.containerW / state.containerH;
        const terminalRatio = terminalW / terminalH;

        if (containerRatio > terminalRatio) {
          priority = 'height';
        }
      }

      if (priority == 'width') {
        const scale = state.containerW / terminalW;

        return {
          scale: scale,
          width: state.containerW,
          height: terminalH * scale
        };
      } else {
        const scale = state.containerH / terminalH;

        return {
          scale: scale,
          width: terminalW * scale,
          height: state.containerH
        };
      }
    } else {
      return {
        scale: 1,
        width: 200,
        height: 100
      };
    }
  });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.requestFullscreen();
    }
  }

  const onFinish = () => {
    console.log('finished');
    setState('state', 'paused');
    updateTime();
    stopTimeUpdates();
    stopBlinking();
  }

  const onKeyPress = (e) => {
    console.log(e);

    if (!e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      if (e.key == ' ') {
        e.preventDefault();
        pauseOrResume();
      } else if (e.key == 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    }
  }

  const startTimeUpdates = () => {
    timeUpdateIntervalId = setInterval(() => {updateTime()}, 100);
  }

  const stopTimeUpdates = () => {
    clearInterval(timeUpdateIntervalId);
  }

  const updateTime = () => {
    let t = core.getCurrentTime();
    let r = core.getRemainingTime();
    let p = core.getProgress();

    setState({ currentTime: t, remainingTime: r, progress: p});
  }

  const startBlinking = () => {
    blinkIntervalId = setInterval(() => {
      setState('blink', blink => !blink);
    }, 500);
  }

  const stopBlinking = () => {
    clearInterval(blinkIntervalId);
    setState('blink', true);
  }

  const showControls = (show) => {
    if (show) {
      clearTimeout(userActivityTimeoutId);
      setState('showControls', true);
      userActivityTimeoutId = setTimeout(() => showControls(false), 2000);
    } else {
      clearTimeout(userActivityTimeoutId);
      setState('showControls', false);
    }
  }

  const playerStyle = () => {
    const size = terminalSize();

    if (size.width) {
      return {
        width: `${size.width}px`,
        height: `${size.height}px`
      }
    } else {
      return {
        height: 0
      }
    }
  }

  const terminalScale = () => terminalSize().scale;

  // TODO visibility: hidden until loaded/resized
  return (
    <div class="asciinema-player-wrapper" classList={{ hud: state.showControls }} tabIndex="-1" onKeyPress={onKeyPress} ref={wrapperRef}>
      <div class="asciinema-player asciinema-theme-asciinema font-small" style={playerStyle()} onMouseEnter={() => showControls(true)} onMouseLeave={() => showControls(false)} onMouseMove={() => showControls(true)}>
        <Terminal width={state.width || 80} height={state.height || 24} scale={terminalScale()} blink={state.blink} lines={state.lines} cursor={state.cursor} ref={terminalRef} />
        <ControlBar currentTime={state.currentTime} remainingTime={state.remainingTime} progress={state.progress} isPlaying={state.state == 'playing'} isPausable={core.isPausable()} isSeekable={core.isSeekable()} onPlayClick={pauseOrResume} onFullscreenClick={toggleFullscreen} />
        <Switch>
          <Match when={state.state == 'initial'}><StartOverlay onClick={play} /></Match>
          <Match when={state.state == 'waiting'}><LoaderOverlay /></Match>
        </Switch>
      </div>
    </div>
  );
}