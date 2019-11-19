// Libraries
import React, { Component } from "react";
import { inject, observer } from "mobx-react";
import { Link } from "react-router-dom";
import Steps, { Step } from "rc-steps";

// Components
import InlineNotification from "./InlineNotification";
import LegacyCupsAlert from "./LegacyCupsAlert";
import TooltipHint from "./TooltipHint";

// Utils
import {
  WAD,
  wmul,
  wdiv,
  toBigNumber,
  fromWei,
  toWei,
  printNumber,
  formatNumber
} from "../utils/helpers";

import "rc-steps/assets/index.css";

const StepIcon = ({ step }) => (
  <div className="rc-steps-item-icon-inner">{step}</div>
);

@inject("profile")
@inject("system")
@observer
class Wizard extends Component {
  constructor() {
    super();
    this.state = {
      step: 1,
      eth: toBigNumber(0),
      ethText: "",
      skr: toBigNumber(0),
      dai: toBigNumber(0),
      daiText: "",
      maxDaiAvail: null,
      minETHReqText: null,
      liqPrice: null,
      ratio: null,
      error: false,
      warning: false,
      submitEnabled: false,
      checkTerms: false,
      stepsExpanded: false
    };
  }

  steps = () => {
    const steps = [
      { text: "创建代理" },
      { text: "创建 CDP" },
      {
        text: "打包 ETH 成 ERC20 格式的 WETH",
        tip: <TooltipHint tipKey="wizard-wrap-eth-to-weth" />
      },
      {
        text: "将 WETH 转换成 PETH",
        tip: <TooltipHint tipKey="wizard-convert-weth-to-peth" />
      },
      { text: "CDP 创建完成 - 你转换后的 ETH 已经存起来" },
      { text: "Sai 生成完成 - 你需要的 Sai 已经生成" },
      { text: "Sai 发送完成 - 你需要的 Sai 已经发送到你的钱包" }
    ];
    if (this.props.profile.proxy && this.props.profile.proxy !== -1) {
      steps.shift();
    }

    return steps;
  };

  checkValues = (token, amount) => {
    const amountBN = toBigNumber(amount);
    const state = { ...this.state };
    state[token] = toWei(amountBN);
    state[`${token}Text`] = amount;
    state.skr = toBigNumber(0);
    state.maxDaiAvail = null;
    state.liqPrice = null;
    state.ratio = null;
    state.error = "";
    state.warning = "";

    if (state.eth.gt(0)) {
      state.skr = wdiv(state.eth, this.props.system.tub.per).floor();
      state.maxDaiAvail = wdiv(
        wmul(state.skr, this.props.system.tub.tag),
        wmul(this.props.system.tub.mat, this.props.system.vox.par)
      ).floor();
    }

    if (state.dai.gt(0)) {
      state.minETHReq = wmul(
        wdiv(
          wmul(
            state.dai,
            wmul(this.props.system.tub.mat, this.props.system.vox.par)
          ),
          this.props.system.tub.tag
        ),
        this.props.system.tub.per
      ).round(0);
    }

    this.setState(state, () => {
      this.setState(prevState => {
        const state = { ...prevState };

        state.submitEnabled = false;
        state.error = false;

        if (state.eth.gt(0) && this.props.system.eth.myBalance.lt(state.eth)) {
          state.error = "你没有足够的 ETH。";
          return state;
        } else if (state.skr.gt(0) && state.skr.round(0).lte(toWei(0.005))) {
          state.error = `最低存入 CDP 数量需要高于 0.005 PETH. (${formatNumber(
            wmul(toBigNumber(toWei(0.005)), this.props.system.tub.per),
            18
          )} ETH 实时价格).`;
          return state;
        }

        if (state.eth.gt(0) && state.dai.gt(0)) {
          if (
            this.props.system.sin.totalSupply
              .add(state.dai)
              .gt(this.props.system.tub.cap)
          ) {
            state.error = "你希望生成的 Sai 超过了系统的债务上限。";
          } else if (state.dai.gt(state.maxDaiAvail)) {
            state.error = "你存入的 ETH 数量不足以生成这么多的 Sai。";
          } else {
            state.liqPrice = this.props.system.calculateLiquidationPrice(
              state.skr,
              state.dai
            );
            state.ratio = this.props.system.calculateRatio(
              state.skr,
              state.dai
            );
            if (state.ratio.lt(WAD.times(2))) {
              state.warning =
                "提醒：希望生成 Sai 的数量会让你的 CDP 比较接近清算值。";
            }
            state.submitEnabled = true;
          }
          return state;
        }
      });
    });
  };

  goToStep = step => {
    this.setState({ step }, () => {
      TooltipHint.rebuildTooltips();
    });
  };

  toggleExpand = () => {
    this.setState({ stepsExpanded: !this.state.stepsExpanded });
  };

  execute = e => {
    e.preventDefault();
    this.props.system.lockAndDraw(
      false,
      fromWei(this.state.eth),
      fromWei(this.state.dai)
    );
  };

  check = (checked, type) => {
    const state = { ...this.state };
    state[type] = checked;
    this.setState(state);
  };

  render() {
    const stabilityFee = printNumber(
      toWei(fromWei(this.props.system.tub.fee).pow(60 * 60 * 24 * 365))
        .times(100)
        .minus(toWei(100)),
      1,
      true,
      true
    );

    return (
      <div className="wizard-section">
        <LegacyCupsAlert setOpenMigrate={this.props.setOpenMigrate} />
        <header className="col" style={{ borderBottom: "none" }}>
          <Steps current={this.state.step - 1}>
            <Step title="质押并生成 SAI" icon={<StepIcon step="1" />} />
            <Step title="确认细节" icon={<StepIcon step="2" />} />
          </Steps>
        </header>
        {this.state.step === 1 ? (
          <React.Fragment>
            <form
              ref={input => (this.wizardForm = input)}
              onSubmit={e => {
                e.preventDefault();
                this.goToStep(2);
              }}
            >
              <div className="row">
                <div className="col col-2" style={{ border: "none" }}>
                  <label className="typo-cl no-select">
                    你希望质押多少 ETH？
                  </label>
                  <div className="input-values-container">
                    <input
                      ref={input => (this.eth = input)}
                      type="number"
                      id="inputETH"
                      className="number-input"
                      required
                      step="0.000000000000000001"
                      placeholder="0.000"
                      value={this.state.ethText}
                      onChange={e => {
                        this.checkValues("eth", e.target.value);
                      }}
                      onKeyDown={e => {
                        if (
                          e.keyCode === 38 ||
                          e.keyCode === 40 ||
                          e.keyCode === 189
                        )
                          e.preventDefault();
                      }}
                    />
                    <span className="unit" style={{ marginBottom: "0.35rem" }}>
                      ETH
                    </span>
                    <div className="typo-cs align-right clearfix">
                      {printNumber(this.state.skr)} PETH{" "}
                      <TooltipHint tipKey="what-is-peth" />
                    </div>
                    {this.state.minETHReq && (
                      <p className="typo-cs align-right">
                        最低存入数量: {printNumber(this.state.minETHReq)} ETH
                      </p>
                    )}
                  </div>
                </div>

                <div className="col col-2">
                  <label className="typo-cl no-select">
                    你希望生成多少 SAI？
                  </label>
                  <div className="input-values-container">
                    <input
                      ref={input => (this.dai = input)}
                      type="number"
                      id="inputSAI"
                      className="number-input"
                      required
                      step="0.000000000000000001"
                      placeholder="0.000"
                      value={this.state.daiText}
                      onChange={e => {
                        this.checkValues("dai", e.target.value);
                      }}
                      onKeyDown={e => {
                        if (
                          e.keyCode === 38 ||
                          e.keyCode === 40 ||
                          e.keyCode === 189
                        )
                          e.preventDefault();
                      }}
                    />
                    <span className="unit" style={{ marginBottom: "0.35rem" }}>
                      SAI
                    </span>
                    {this.state.maxDaiAvail && (
                      <p className="typo-cs align-right">
                        最多借出数量: {printNumber(this.state.maxDaiAvail)} SAI
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col col-2">
                  <div style={{ marginBottom: "1rem" }}>
                    <h3 className="typo-cl inline-headline">
                      清算价格 (ETH/USD)
                    </h3>
                    <TooltipHint tipKey="liquidation-price" />
                    <div className="value typo-cl typo-bold right">
                      {this.state.liqPrice
                        ? printNumber(this.state.liqPrice)
                        : "--"}{" "}
                      USD
                    </div>
                  </div>
                  <div>
                    <h3 className="typo-c inline-headline">
                      当前的价格信息（ETH/USD）
                    </h3>
                    <TooltipHint tipKey="current-price-information" />
                    <div className="value typo-c right">
                      {printNumber(this.props.system.pip.val)} USD
                    </div>
                  </div>
                  <div>
                    <h3 className="typo-c inline-headline">清算罚金</h3>
                    <TooltipHint tipKey="liquidation-penalty" />
                    <div className="value typo-c right">
                      {printNumber(
                        this.props.system.tub.axe.minus(WAD).times(100)
                      )}
                      %
                    </div>
                  </div>
                </div>

                <div className="col col-2">
                  <div style={{ marginBottom: "1rem" }}>
                    <h3 className="typo-cl inline-headline">质押比例</h3>
                    <TooltipHint tipKey="collateralization-ratio" />
                    <div className="value typo-cl typo-bold right">
                      {this.state.ratio
                        ? printNumber(this.state.ratio.times(100))
                        : "--"}
                      %
                    </div>
                  </div>
                  <div>
                    <h3 className="typo-c inline-headline">最低比例</h3>
                    <div className="value typo-c right">
                      {printNumber(this.props.system.tub.mat.times(100))}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="row" style={{ borderBottom: "none" }}>
                <p className="no-select">
                  稳定费用年化 {stabilityFee}%
                  <TooltipHint tipKey="stability-fee" />
                </p>
              </div>

              <div className="row" style={{ borderBottom: "none" }}>
                {this.state.warning && (
                  <InlineNotification
                    type="warning"
                    message={this.state.warning}
                  />
                )}
                {this.state.error && (
                  <InlineNotification type="error" message={this.state.error} />
                )}
              </div>

              <div className="row" style={{ borderBottom: "none" }}>
                <div className="col">
                  <button
                    className="bright-style text-btn text-btn-primary"
                    type="submit"
                    disabled={!this.state.submitEnabled}
                  >
                    质押并生成 Dai
                  </button>
                </div>
              </div>
            </form>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div className="row">
              <div className="col">
                <h3 className="typo-cl">质押并生成 Sai</h3>
              </div>
            </div>

            <div className="row">
              <div className="col col-2">
                <div>
                  <h3 className="typo-cl inline-headline">质押品</h3>
                  <div className="value typo-cl typo-bold right">
                    {printNumber(this.state.eth)} ETH
                  </div>
                </div>
              </div>
              <div className="col col-2">
                <div>
                  <h3 className="typo-cl inline-headline">生成:</h3>
                  <div className="value typo-cl typo-bold right">
                    {printNumber(this.state.dai)} SAI
                  </div>
                </div>
              </div>
            </div>

            <div className="row" style={{ marginTop: "50px" }}>
              <div className="col">
                <h3 className="typo-cl">交易细节</h3>
              </div>
            </div>

            <div className="row">
              <div className="col">
                <h3 className="typo-cl" style={{ marginBottom: "1rem" }}>
                  自动执行智能合约交易
                </h3>

                <div className="typo-c no-select clear-left">
                  {this.state.stepsExpanded ? (
                    <svg
                      className="wizard expand-section-btn"
                      width="28"
                      height="28"
                      viewBox="0 0 28 28"
                      xmlns="http://www.w3.org/2000/svg"
                      onClick={() => this.toggleExpand()}
                    >
                      <path
                        d="m1022.95113 481.269219-4.95267-4.953847-4.95267 4.953847-1.50733-1.507693 6.46-6.461538 6.46 6.461538zm-4.95113 10.730781c-7.73199 0-14-6.268014-14-14s6.26801-14 14-14 14 6.268014 14 14-6.26801 14-14 14zm0-2.153846c6.54245 0 11.84615-5.303704 11.84615-11.846154s-5.3037-11.846154-11.84615-11.846154-11.84615 5.303704-11.84615 11.846154 5.3037 11.846154 11.84615 11.846154z"
                        fill="#9aa3ad"
                        transform="translate(-1004 -464)"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="wizard expand-section-btn"
                      width="28"
                      height="28"
                      viewBox="0 0 28 28"
                      xmlns="http://www.w3.org/2000/svg"
                      onClick={() => this.toggleExpand()}
                    >
                      <path
                        d="m1080.95385 474.769231-4.95385 4.953846-4.95385-4.953846-1.50769 1.507692 6.46154 6.461539 6.46154-6.461539zm-4.95385 17.230769c-7.73199 0-14-6.268014-14-14s6.26801-14 14-14 14 6.268014 14 14-6.26801 14-14 14zm0-2.153846c6.54245 0 11.84615-5.303704 11.84615-11.846154s-5.3037-11.846154-11.84615-11.846154-11.84615 5.303704-11.84615 11.846154 5.3037 11.846154 11.84615 11.846154z"
                        transform="translate(-1062 -464)"
                      />
                    </svg>
                  )}
                  创建 CDP 包含 {this.steps().length}{" "}
                  个步骤。&nbsp;&nbsp;将会自动执行以方便化。
                </div>

                <div
                  className={
                    "typo-c wizard-automated-transactions" +
                    (this.state.stepsExpanded ? " expanded" : "")
                  }
                >
                  {this.steps().map((s, key) => (
                    <div className="step-cointainer" key={key}>
                      <div className="step-icon">
                        <div className="steps-item">
                          <div className="steps-item-inner">{key + 1}</div>
                        </div>
                        <div className="vertical-line"></div>
                      </div>
                      <div className="step-message">
                        <span>
                          {s.text}
                          {s.tip}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="inline-notification is-stability-fee-warning">
              <p style={{ color: "#B42B00", fontWeight: 500 }}>
                在你开启 CDP 后，稳定费用可能会随着市场环境变化而调整，
                <a
                  href="https://www.reddit.com/r/MakerDAO/comments/93adqj/faq_stability_fee_raise/"
                  rel="noopener noreferrer"
                  style={{ color: "#447AFB", textDecoration: "none" }}
                  target="_blank"
                >
                  了解更多。
                </a>
                稳定费用目前是年化 <strong>{stabilityFee}%。</strong>
              </p>
            </div>

            <div className="row" style={{ border: "none" }}>
              <div className="col">
                <div style={{ marginBottom: "2rem" }}>
                  <label className="checkbox-container">
                    <input
                      type="checkbox"
                      checked={this.state.checkTerms}
                      value="1"
                      onChange={e => this.check(e.target.checked, "checkTerms")}
                    />
                    <span className="checkmark"></span>
                    我已经阅读并同意{" "}
                    <Link to="/terms" target="_blank">
                      使用条款
                    </Link>
                  </label>
                </div>
                <div>
                  <button
                    className="bright-style text-btn"
                    onClick={() => this.goToStep(1)}
                  >
                    返回
                  </button>
                  <button
                    className="bright-style text-btn text-btn-primary"
                    onClick={this.execute}
                    disabled={!this.state.checkTerms}
                  >
                    完成并创建 CDP
                  </button>
                </div>
              </div>
            </div>
          </React.Fragment>
        )}
      </div>
    );
  }
}

export default Wizard;
