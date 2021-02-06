import { computed, inject, ref, getCurrentInstance, onBeforeMount, watch } from 'vue'
import LeFEUtils from "lefe-utils";

const tpl = (key, data) => {
  if (!key) return '';
  if (typeof key === 'function') return key(data);
  return key.includes('${') ? LeFEUtils.template(key, data) : key;
}
const parseValue = (key, data) => LeFEUtils.getByChain(data, tpl(key, data));

const traversal = (block) => {
  let result = [];
  if (!block.children || !block.children.length) return [block];
  block.children.forEach(child => {
    result = result.concat(traversal(child))
  })
  return result;
}

export function common(props, context, params) {
  const { defaultProps = {} } = params || {};
  const mergedProps = computed(() => {
    const p = {};
    // 处理'-'到驼峰
    Object.keys(props.props).forEach(key => {
      const LeFEIndex = key.indexOf('_LeFE');
      let value = props.props[key];
      // console.log('key', key, value, props.store)
      if (LeFEIndex != -1) {
        key = key.substr(0, LeFEIndex);
        value = parseValue(value, props.store);
      }
      const index = key.indexOf('-');
      if (index == -1) {
        p[key] = value;
      } else {
        p[key.slice(0, index) + key[index + 1].toUpperCase() + key.substr(index + 2)] = props.props[key];
      }
    })
    return Object.assign(defaultProps, p);
  });
  const vif = (condition) => {
    if (condition === undefined) return true;
    if (typeof condition === 'boolean') return condition;
    if (typeof condition === 'string') return !!parseValue(condition, props.store);
    if (typeof condition === 'function') return !!condition(props.store);
    return true;
  }
  const disabled = (disabled) => {
    if (disabled === undefined) return false;
    if (typeof disabled === 'boolean') return disabled;
    if (typeof disabled === 'string') return !!parseValue(disabled, props.store);
    if (typeof disabled === 'function') return !!disabled(props.store)
    return false;
  }

  return {
    mergedProps,
    tpl: (key) => tpl(key, props.store),
    vif,
    disabled,
    parseValue: (key) => parseValue(key, props.store),
    parseRender: computed(() => tpl(props.render, props.store)),
    traversal
  }
}

export function state(props) {
  const eventEmitter = inject('eventEmitter')
  const stateKey = computed(() => {
    const { state } = props;
    if (state === undefined) return state;
    return state instanceof Array ? state[0] : tpl(state, props.store)
  });
  // const store = reactive(props.store);
  const stateValue = ref(parseValue(stateKey.value, props.store))
  watch(
    () => LeFEUtils.getByChain(props.store, stateKey.value),
    (newValue) => {
      if (newValue == stateValue.value) return;
      stateValue.value = newValue
    }
  )
  return {
    state: stateKey,
    stateValue,
    change: (value, key) => {
      eventEmitter.emit(`change_${props.store.LeFE_ID}`, { key: key || stateKey.value, value })
    }
  }
}

export function events(props) {
  const eventEmitter = inject('eventEmitter');
  const eventLoading = ref(false)
  const getMethod = (method) => method instanceof Array ? method : [method, {}]
  const trigger = (eventName) => {
    const { events, store } = props;
    if (!events || !events[eventName]) return false;
    const [method, params] = getMethod(events[eventName]);
    eventLoading.value = true;
    new Promise((resolve, reject) => {
      eventEmitter.emit(`trigger_${store.LeFE_ID}`, { method, params, resolve, reject })
    }).then(() => {
      eventLoading.value = false;
    }).catch(() => {
      eventLoading.value = false;
    })
  }
  return {
    eventLoading,
    trigger,
  }
}

export function dataSource(props) {
  const http = inject('http');
  const eventEmitter = inject('eventEmitter');
  const dataArray = ref([]);
  const originDataArray = ref([]);
  const dataSource = props.dataSource;

  if (dataSource) {
    if (dataSource instanceof Array) {
      dataArray.value = dataSource;
    } else if (typeof dataSource === 'string') {
      dataArray.value = parseValue(dataSource, props.store);
      watch(
        () => LeFEUtils.getByChain(props.store, dataSource),
        (newValue) => {
          dataArray.value = newValue;
          originDataArray.value = newValue;
        })
    }
    originDataArray.value = dataArray.value
  }

  const _fetch = (params) => {
    const { store, dataSource } = props;
    if (typeof dataSource !== 'object') return new Promise((resolve) => resolve());
    const {
      url,
      bodyFormatter = () => ({}),
      method = 'post',
      repFormatter = rep => rep,
      state = ''
    } = dataSource;

    const body = bodyFormatter({ ...store, ...params });
    // 阻止发送请求
    if (typeof body === 'boolean' && body === false) return new Promise((resolve) => resolve(false));
    return http[method](tpl(url, props.store), body)
      .then(rep => {
        const repFormat = repFormatter(rep, body, store);
        if (state) {
          eventEmitter.emit(`change_${props.store.LeFE_ID}`, {
            key: tpl(state, props.store),
            value: repFormat instanceof Array ? repFormat : repFormat.data
          })
        }
        return repFormat;
      })
  }
  return {
    dataArray,
    originDataArray,
    _fetch
  }
}

export function exportKey(props) {
  if (props.exportsKey === undefined) return;
  onBeforeMount(() => {
    const eventEmitter = inject('eventEmitter');
    const internalInstance = getCurrentInstance();
    const key = tpl(props.exportsKey, props.store) + '_' + props.store.LeFE_ID;
    eventEmitter.removeListener(key);
    eventEmitter.addListener(key, ({ action, key, method, data, params, resolve, reject }) => {
      try {
        switch (action) {
          case 'change':
            Object.entries(data).forEach(([key, value]) => {
              if (internalInstance.data[key] === undefined) {
                console.warn(`No ${key} defined in ${props.exportsKey}`)
              } else {
                internalInstance.data[key] = value;
              }
            })
            break;
          case 'trigger':
            if (internalInstance.ctx[method] === undefined) {
              console.warn(`No ${method} method defined in ${props.exportsKey}`)
              reject();
            } else {
              const p = internalInstance.ctx[method].call(internalInstance.ctx, params);
              if (p instanceof Promise) {
                p.then(rep => resolve(rep)).catch(e => reject(e))
              } else {
                resolve(p)
              }
            }
            break;
          case 'get':
            resolve(key ? internalInstance.ctx[key] : internalInstance.ctx)
        }
      } catch (e) {
        reject && reject(e)
      }
    })
  })
}

export function rules(props) {
  if (!(props.props && props.props.rules)) return {};
  const model = computed(() => {
    const result = {}
    Object.keys(props.props.rules).forEach(key => {
      result[key.replace(/\./ig, '-')] = parseValue(key, props.store)
    })
    return result;
  })
  const rules = computed(() => {
    const result = {}
    Object.entries(props.props.rules).forEach(([key, value]) => {
      result[key.replace(/\./ig, '-')] = value
    })
    Object.entries(result).forEach(([key, value]) => {
      result[key] = value.map(rule => {
        if (!rule.validator) return rule;
        const oldValidator = rule.validator;
        rule.validator = function(rule, value, callback) {
          oldValidator(rule, value, callback, props.store)
        }
        return rule
      })
    })
    return result;
  })
  return {
    model,
    rules
  }
}