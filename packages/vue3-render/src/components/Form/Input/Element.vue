<template>
  <el-input
    v-bind="mergedProps"
    @input="input"
    @blur="blur"
    @clear="change('')"
    v-model="stateValue"
  >
    <template v-if="mergedProps.prepend" #prepend>{{ renderWithStore(mergedProps.prepend) }}</template>
    <template v-if="mergedProps.append" #append>{{ renderWithStore(mergedProps.append) }}</template>
  </el-input>
</template>

<script>
  import props from '../../../composition/props'
  import { common, events, exportKey, state } from '../../../composition/setup'

  export default {
    name: 'LeFEInput',
    props,
    setup(props, context) {
      exportKey(props)
      return {
        ...common(props, context),
        ...state(props),
        ...events(props)
      }
    },
    methods: {
      input(value) {
        this.change(value);
      },
      blur() {
        this.trigger('blur');
      },
    }
  }
</script>

<style scoped>

</style>
