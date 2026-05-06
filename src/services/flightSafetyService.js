(() => {
  'use strict';

  const root = window.SkyDroneServices = window.SkyDroneServices || {};

  function toNumber(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function upperStatus(value, warningLimit, dangerLimit) {
    const parsed = toNumber(value);
    if (!Number.isFinite(parsed)) return 'warning';
    if (parsed > dangerLimit) return 'danger';
    if (parsed > warningLimit) return 'warning';
    return 'ok';
  }

  function lowerStatus(value, warningLimit, dangerLimit) {
    const parsed = toNumber(value);
    if (!Number.isFinite(parsed)) return 'warning';
    if (parsed < dangerLimit) return 'danger';
    if (parsed < warningLimit) return 'warning';
    return 'ok';
  }

  function pressureStatus(value) {
    const pressure = toNumber(value);
    if (!Number.isFinite(pressure)) return 'warning';
    if (pressure < 990 || pressure > 1040) return 'danger';
    if (pressure < 1000 || pressure > 1028) return 'warning';
    return 'ok';
  }

  function reliabilityStatus(value) {
    const reliability = toNumber(value, 0);
    if (reliability < 60) return 'danger';
    if (reliability <= 80) return 'warning';
    return 'ok';
  }

  function getCurrentData(input) {
    const current = input?.current || input || {};
    const analytics = input?.analytics || {};
    return {
      wind: toNumber(current.windSpeed, toNumber(current.wind)),
      gusts: toNumber(current.windGusts, toNumber(current.wind_gusts)),
      rain: toNumber(current.precipitation, toNumber(current.precip, 0)),
      rainProbability: toNumber(current.rainProbability, toNumber(current.rain_probability, 0)),
      humidity: toNumber(current.humidity),
      pressure: toNumber(current.pressure),
      visibility: toNumber(current.visibilityKm, toNumber(current.visibility_km)),
      feelsLike: toNumber(current.feelsLike, toNumber(current.feels_like, toNumber(current.temperature, toNumber(current.temp)))),
      temperature: toNumber(current.temperature, toNumber(current.temp)),
      reliability: toNumber(analytics.confidence, toNumber(current.confidence, toNumber(input?.reliability, 0))),
      updatedAt: input?.generatedAt || current.time || input?.generated_at || input?.updatedAt || null,
      source: input?.sources_used || input?.source || getSourceLabel(input),
      cached: Boolean(input?.cached || input?.cacheInfo?.used || analytics.reliability?.fromCache),
      cacheAgeMs: toNumber(input?.cache_age_ms, toNumber(input?.cacheInfo?.ageMs, toNumber(analytics.reliability?.ageMs, 0))),
      demo: Boolean(input?.demo || analytics.reliability?.isDemo)
    };
  }

  function getSourceLabel(input) {
    const providers = Array.isArray(input?.providers) ? input.providers : [];
    const labels = providers
      .filter((run) => run && run.success !== false && !run.hidden)
      .map((run) => run.label || run.providerKey)
      .filter(Boolean);
    return labels.join(', ');
  }

  function scoreForStatus(status, warningPenalty, dangerPenalty) {
    if (status === 'danger') return dangerPenalty;
    if (status === 'warning') return warningPenalty;
    return 0;
  }

  function evaluate(input, options = {}) {
    const data = getCurrentData(input);
    const cacheInfo = options.cacheInfo || input?.cacheInfo || {};
    const cacheAgeMs = toNumber(cacheInfo.ageMs, data.cacheAgeMs);
    const cached = Boolean(cacheInfo.used || data.cached);
    const demo = Boolean(data.demo || options.demo);
    const rainDanger = data.rain >= 2.5 || data.rainProbability >= 70;
    const rainWarning = data.rain > 0 || data.rainProbability > 30;

    const metrics = {
      wind: {
        value: data.wind,
        status: upperStatus(data.wind, 30, 40),
        warningText: 'Vento acima de 30 km/h. Voe baixo, curto e com margem de retorno.',
        dangerText: 'Vento acima de 40 km/h. Voo nao recomendado.'
      },
      gusts: {
        value: data.gusts,
        status: upperStatus(data.gusts, 35, 45),
        warningText: 'Rajadas moderadas podem afetar hover e pouso.',
        dangerText: 'Rajadas acima de 45 km/h. Voo nao recomendado.'
      },
      rain: {
        value: data.rainProbability,
        precipitation: data.rain,
        status: rainDanger ? 'danger' : rainWarning ? 'warning' : 'ok',
        warningText: 'Sinal de chuva. Planeje pouso alternativo e reduza alcance.',
        dangerText: 'Chuva forte ou alta probabilidade de chuva. Voo nao recomendado.'
      },
      visibility: {
        value: data.visibility,
        status: lowerStatus(data.visibility, 6, 3),
        warningText: 'Visibilidade reduzida. Mantenha VLOS constante.',
        dangerText: 'Visibilidade critica. Operacao visual comprometida.'
      },
      humidity: {
        value: data.humidity,
        status: upperStatus(data.humidity, 85, 92),
        warningText: 'Umidade alta. Verifique lente, sensores e sinais de condensacao.',
        dangerText: 'Umidade extrema. Risco maior para eletronica e sensores.'
      },
      pressure: {
        value: data.pressure,
        status: pressureStatus(data.pressure),
        warningText: 'Pressao fora da faixa ideal. Monitore mudancas rapidas no tempo.',
        dangerText: 'Pressao atmosferica critica. Adie o voo.'
      },
      reliability: {
        value: data.reliability,
        status: reliabilityStatus(data.reliability),
        warningText: 'Confiabilidade entre 60% e 80%. Voe com cautela.',
        dangerText: 'Confiabilidade abaixo de 60%. Voo nao recomendado.'
      },
      feelsLike: {
        value: data.feelsLike,
        status: (data.feelsLike < 0 || data.feelsLike > 38) ? 'danger' : (data.feelsLike < 5 || data.feelsLike > 32) ? 'warning' : 'ok',
        warningText: 'Temperatura aparente fora da faixa ideal. Monitore bateria.',
        dangerText: 'Temperatura aparente extrema. Risco elevado para bateria e motor.'
      }
    };

    if (cached && cacheAgeMs > 30 * 60 * 1000 && metrics.reliability.status === 'ok') {
      metrics.reliability.status = 'warning';
      metrics.reliability.warningText = 'Usando cache salvo antigo. Confirme o clima antes de decolar.';
    }

    if (demo && metrics.reliability.status !== 'danger') {
      metrics.reliability.status = 'warning';
      metrics.reliability.warningText = 'Dados demo. Use apenas para teste do painel.';
    }

    let score = 100;
    score -= scoreForStatus(metrics.wind.status, 14, 30);
    score -= scoreForStatus(metrics.gusts.status, 12, 28);
    score -= scoreForStatus(metrics.rain.status, 15, 34);
    score -= scoreForStatus(metrics.visibility.status, 12, 26);
    score -= scoreForStatus(metrics.humidity.status, 7, 16);
    score -= scoreForStatus(metrics.pressure.status, 6, 18);
    score -= scoreForStatus(metrics.reliability.status, 18, 45);
    score -= scoreForStatus(metrics.feelsLike.status, 7, 16);
    score = Math.max(0, Math.round(Math.min(score, data.reliability || 98)));

    const statusList = Object.values(metrics).map((metric) => metric.status);
    let overallStatus = 'safe';
    if (statusList.includes('danger')) {
      overallStatus = 'danger';
    } else if (statusList.includes('warning')) {
      overallStatus = 'warning';
    }

    const leadRisk = getLeadRisk(metrics, cached, demo);
    const badges = buildBadges(metrics, cached, demo, data);
    const recommendation = buildRecommendation(metrics, overallStatus, cached, demo, data);

    return {
      ...metrics,
      score,
      overallStatus,
      statusLabel: overallStatus === 'safe' ? 'Seguro' : overallStatus === 'warning' ? 'Atencao' : 'Nao recomendado',
      leadRisk,
      badges,
      recommendation,
      source: data.source,
      updatedAt: data.updatedAt,
      cached,
      cacheAgeMs,
      demo
    };
  }

  function getLeadRisk(metrics, cached, demo) {
    const priority = ['reliability', 'rain', 'wind', 'gusts', 'visibility', 'pressure', 'humidity', 'feelsLike'];
    for (const key of priority) {
      if (metrics[key].status === 'danger') return metrics[key].dangerText;
    }
    if (cached) return 'Usando ultimo dado valido salvo. Confirme as condicoes antes de decolar.';
    if (demo) return 'Dados demo ativos. Use apenas para validar a interface.';
    for (const key of priority) {
      if (metrics[key].status === 'warning') return metrics[key].warningText;
    }
    return 'Condicoes boas para voo curto. Vento dentro do limite, mas monitore rajadas.';
  }

  function buildBadges(metrics, cached, demo, data) {
    const badges = [];
    if (metrics.reliability.status !== 'ok') badges.push(`Confiabilidade ${Math.round(data.reliability || 0)}%`);
    if (metrics.wind.status !== 'ok') badges.push(metrics.wind.status === 'danger' ? 'Vento acima do limite' : 'Vento em atencao');
    if (metrics.gusts.status !== 'ok') badges.push(metrics.gusts.status === 'danger' ? 'Rajadas criticas' : 'Monitorar rajadas');
    if (metrics.rain.status !== 'ok') badges.push(metrics.rain.status === 'danger' ? 'Chuva forte' : 'Risco de chuva');
    if (metrics.visibility.status !== 'ok') badges.push('Visibilidade reduzida');
    if (cached) badges.push('Cache salvo');
    if (demo) badges.push('Demo');
    if (!badges.length) {
      badges.push('Vento dentro do limite', 'Boa visibilidade', 'Dados confiaveis');
    }
    return badges.slice(0, 3);
  }

  function buildRecommendation(metrics, overallStatus, cached, demo, data) {
    if (overallStatus === 'danger') {
      if (metrics.reliability.status === 'danger') {
        return 'Voo nao recomendado: confiabilidade abaixo de 60%. Aguarde nova atualizacao com dados reais.';
      }
      if (metrics.rain.status === 'danger') {
        return 'Voo nao recomendado: chuva forte ou alta probabilidade de chuva no curto prazo.';
      }
      if (metrics.wind.status === 'danger' || metrics.gusts.status === 'danger') {
        return 'Voo nao recomendado: vento ou rajadas acima do limite seguro para drone.';
      }
      return 'Voo nao recomendado. Ha uma condicao meteorologica critica para a operacao.';
    }

    if (overallStatus === 'warning') {
      if (cached) return 'Voe apenas se conseguir confirmar visualmente o tempo: o sistema esta usando ultimo dado valido salvo.';
      if (demo) return 'Dados demo detectados. Use somente para teste, nao para decisao real de voo.';
      if (metrics.wind.status === 'warning' || metrics.gusts.status === 'warning') {
        return 'Condicoes aceitaveis para voo curto, mas monitore rajadas e mantenha retorno conservador.';
      }
      if (metrics.rain.status === 'warning') {
        return 'Voo com cautela: ha sinal de chuva. Reduza alcance e defina pouso alternativo.';
      }
      return 'Voo com cautela. Uma ou mais leituras exigem margem operacional extra.';
    }

    return 'Condicoes boas para voo curto. Vento dentro do limite, mas monitore rajadas.';
  }

  function evaluateBundle(bundle, options = {}) {
    return evaluate(bundle, options);
  }

  function toTabsAnalysis(result, sourceConsensus = null) {
    return {
      wind: result.wind,
      gusts: result.gusts,
      rain: result.rain,
      visibility: result.visibility,
      humidity: result.humidity,
      pressure: result.pressure,
      reliability: result.reliability,
      feelsLike: result.feelsLike,
      score: result.score,
      overallStatus: result.overallStatus,
      badges: result.badges,
      leadRisk: result.leadRisk,
      smartRecommendation: result.recommendation,
      sourceConsensus,
      source: result.source,
      updatedAt: result.updatedAt,
      cached: result.cached,
      demo: result.demo
    };
  }

  root.flightSafetyService = {
    evaluate,
    evaluateBundle,
    toTabsAnalysis
  };
})();
