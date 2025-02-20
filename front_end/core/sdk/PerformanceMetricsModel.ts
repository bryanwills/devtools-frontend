// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Platform from '../platform/platform.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';

import type {Target} from './Target.js';
import {Capability} from './Target.js';
import {SDKModel} from './SDKModel.js';

export class PerformanceMetricsModel extends SDKModel<void> {
  private readonly agent: ProtocolProxyApi.PerformanceApi;
  private readonly metricModes: Map<string, MetricMode>;
  private readonly metricData: Map<string, {
    lastValue: (number | undefined),
    lastTimestamp: (number|undefined),
  }>;

  constructor(target: Target) {
    super(target);
    this.agent = target.performanceAgent();

    this.metricModes = new Map([
      ['TaskDuration', MetricMode.CumulativeTime],
      ['ScriptDuration', MetricMode.CumulativeTime],
      ['LayoutDuration', MetricMode.CumulativeTime],
      ['RecalcStyleDuration', MetricMode.CumulativeTime],
      ['LayoutCount', MetricMode.CumulativeCount],
      ['RecalcStyleCount', MetricMode.CumulativeCount],
    ]);

    this.metricData = new Map();
  }

  enable(): Promise<Object> {
    return this.agent.invoke_enable({});
  }

  disable(): Promise<Object> {
    return this.agent.invoke_disable();
  }

  async requestMetrics(): Promise<{
    metrics: Map<string, number>,
    timestamp: number,
  }> {
    const rawMetrics = await this.agent.invoke_getMetrics() || [];
    const metrics = new Map<string, number>();
    const timestamp = performance.now();
    for (const metric of rawMetrics.metrics) {
      let data = this.metricData.get(metric.name);
      if (!data) {
        data = {lastValue: undefined, lastTimestamp: undefined};
        this.metricData.set(metric.name, data);
      }
      let value;
      switch (this.metricModes.get(metric.name)) {
        case MetricMode.CumulativeTime:
          value = (data.lastTimestamp && data.lastValue) ?
              Platform.NumberUtilities.clamp(
                  (metric.value - data.lastValue) * 1000 / (timestamp - data.lastTimestamp), 0, 1) :
              0;
          data.lastValue = metric.value;
          data.lastTimestamp = timestamp;
          break;
        case MetricMode.CumulativeCount:
          value = (data.lastTimestamp && data.lastValue) ?
              Math.max(0, (metric.value - data.lastValue) * 1000 / (timestamp - data.lastTimestamp)) :
              0;
          data.lastValue = metric.value;
          data.lastTimestamp = timestamp;
          break;
        default:
          value = metric.value;
          break;
      }
      metrics.set(metric.name, value);
    }
    return {metrics: metrics, timestamp: timestamp};
  }
}

const enum MetricMode {
  CumulativeTime = 'CumulativeTime',
  CumulativeCount = 'CumulativeCount',
}

SDKModel.register(PerformanceMetricsModel, {capabilities: Capability.DOM, autostart: false});
