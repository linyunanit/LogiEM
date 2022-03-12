import * as React from 'react';
import { IFormItem, FormItemType, XForm as XFormComponent } from 'component/x-form';
import { EditorCom } from 'component/editor';
import { timeFormatList, TEMP_FORM_MAP_KEY } from './constant';
import * as monaco from 'monaco-editor';
import { getFormatJsonStr, goToTargetPage } from 'lib/utils';
import { getJsonMappingData } from './config';
import Url from 'lib/url-parser';
import { updateIndexMappingInfo, checkIndexMappingInfo, getIndexBaseInfo, getIndexMappingInfo } from 'api/cluster-index-api';
import { message, Spin, Tooltip } from 'antd';
import * as actions from 'actions';
import { connect } from "react-redux";

const placeholder = ` ES索引mapping样例如下：
 {
   "key1": {
     "type": "integer"
   },
   "key2": {
     "type": "long"
   }
 }
 批量粘贴时请注意只需要粘贴
 mapping中properties的值即可。
`;

const mapStateToProps = state => ({
  createIndex: state.createIndex
});

@connect(mapStateToProps)
export class JSONMappingSetting extends React.Component<any> {
  private $formRef: any = null;
  private isCyclicalRoll: boolean = false;
  private indexId: number = null;
  private isModifyPage: boolean = true;
  private clusterId: number = null;
  private selfAdaption: number = 300;
  private isDetailPage: boolean = false;
  static defaultProps: { isShowPlaceholder: boolean; } = { isShowPlaceholder: true };

  constructor(props: any) {
    super(props);
    const url = Url();
    this.indexId = Number(url.search.id);
    this.clusterId = Number(url.search.clusterId);
    this.isDetailPage = window.location.pathname.includes('/detail');
    this.isCyclicalRoll = !!(this.props.createIndex.temporaryFormMap.get(TEMP_FORM_MAP_KEY.isCyclicalRoll));
    this.isModifyPage = window.location.pathname.includes('modify/mapping');
    if (this.isModifyPage || this.isDetailPage) {
      this.props.dispatch(actions.setLoadingMap('mapping-loading', true));
    } else {
      this.props.dispatch(actions.setLoadingMap('mapping-loading', false));
    }
  }

  public componentDidMount() {
    this.props.childEvevnt(this);
    if (this.isModifyPage || this.isDetailPage) {

      getIndexBaseInfo(this.indexId).then(info => {
        this.isCyclicalRoll = !!info?.cyclicalRoll;
        this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.isCyclicalRoll, !!info?.cyclicalRoll));
        this.props.dispatch(actions.setLoadingMap('mapping-loading', true));
        getIndexMappingInfo(this.indexId).then(res => {
          const data = res?.typeProperties?.[0];
          const properties = data?.properties;
          if (!properties) {
            return;
          }

          const { dateField, dateFieldFormat, idField, routingField } = data;
          this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingValue, JSON.stringify(properties, null, 4)));
          this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingFormData, {
            primaryKey: idField,
            partition: dateField,
            routing: routingField,
            timeFormat: dateFieldFormat,
          }));
        }).finally(() => {
          this.props.dispatch(actions.setLoadingMap('mapping-loading', false));
        });
      });
    }
    const domClientHeight = document.documentElement.clientHeight;
    const ele = document.getElementsByClassName('json-editor-wrapper')[0];
    if (!this.isDetailPage) {
      const btnEle = document.getElementsByClassName('op-btn-group')[0];
      const btnHeigth = btnEle?.clientHeight;
      // const domTop = ele.offsetTop;
      // 网页可视高度 - 元素到顶部距离  =  元素的高 minHeigth 300
      const value = domClientHeight - (350 + btnHeigth); // 280相当于offsetTop固定的 btnHeigth底部button高度
      if (value > this.selfAdaption) {
        this.selfAdaption = value;
      }
    }
  }

  public componentWillUnmount() {
    if (this.isModifyPage || this.isDetailPage) {
      this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingValue, null));
      this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingFormData, null));
    }
  }

  public getFormMap = (): IFormItem[] => {

    return [{
      key: 'primaryKey',
      label: '主键字段',
      attrs: {
        placeholder: "请输入主键字段",
      },
    }, {
      key: 'routing',
      label: 'Routing字段',
      attrs: {
        placeholder: "请输入Routing字段",
      },
    }, {
      key: 'partition',
      label: '分区字段',
      rules: [{ required: !!this.isCyclicalRoll, message: '请输入分区字段' }],
      attrs: {
        disabled: !this.isCyclicalRoll,
        placeholder: "请输入分区字段",
      },
    }, {
      key: 'timeFormat',
      label: '时间格式',
      type: FormItemType.select,
      options: timeFormatList.map(item => ({
        label: item,
        value: item,
      })),
      attrs: {
        disabled: !this.isCyclicalRoll,
        className: 'time-select',
        placeholder: "请选择时间格式",
      },
      rules: [{ required: !!this.isCyclicalRoll, message: '请选择时间格式' }],
    }] as unknown as IFormItem[];
  }


  public setFilledFormInfo = async() => {
    let result = null;
    await this.$formRef.validateFields().then((values: any) => {
      result = values;
    });
    this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingFormData, result));

    const editor = this.props.createIndex.activeInstance;
    const value = editor ? editor.getValue() : '';
    this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingValue, value));
  }

  public handleSubmit = async() => {
    let result = null;
    await this.$formRef.validateFields().then((values: any) => {
      result = values;
    });

    if (result) {
      this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingFormData, result));
      try {
        const editor = this.props.createIndex.activeInstance;
        const value = editor ? editor.getValue() : '';
        let jsonValue = {};

        if (value) {
          jsonValue = JSON.parse(value  || 'null');
        }
        const params = {
          logicTemplateId: this.indexId,
          mapping: jsonValue,
        };
        checkIndexMappingInfo(params).then(() => {
          this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingValue, value));
          this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.thirdStepPreviewJson, getFormatJsonStr(jsonValue)));
          this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.mappingValue, value));
          this.props.dispatch(actions.setCurrentStep(2));
        });
      } catch {
        message.error('JSON格式有误');
      }
    };
  }

  public handleSave = async(history: string) => {
    this.props.upLoading(true);
    let result = null;
    await this.$formRef.validateFields().then((values: any) => {
      result = values;
    });
    if (result) {
      this.props.dispatch(actions.setTemporaryFormMap(TEMP_FORM_MAP_KEY.jsonMappingFormData, result));

      try {
        const editor = this.props.createIndex.activeInstance;
        const value = editor ? editor.getValue() : '';
        let jsonValue = {};

        if (value) {
          jsonValue = JSON.parse(value  || 'null');
        }
        const params = {
          logicId: this.indexId,
          typeProperties: [{
            properties: jsonValue,
          }],
        };
        getJsonMappingData(params);
        this.props.dispatch(actions.setLoadingMap('update-schema', true));
        updateIndexMappingInfo(params).then(() => {
          message.success('编辑成功');
          window.setTimeout(() => {
            window.location.href = history;
          }, 2000);
        }).finally(() => {
          this.props.upLoading(false);
          this.props.dispatch(actions.setLoadingMap('update-schema', false));
        });
      } catch {
        message.error('JSON格式有误');
      }
    };
  }

  public customMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: any) => {
    const model = editor.getModel();
    const lineNumber = model.getLineCount();

    editor.setPosition({
      lineNumber,
      column: model.getLineMaxColumn(lineNumber),
    });

    editor.onDidChangeModelContent((e) => {
      //
    });

    this.props.dispatch(actions.setEditorInstance(editor));
  }

  public render() {
    const formData = this.props.createIndex.temporaryFormMap.get(TEMP_FORM_MAP_KEY.jsonMappingFormData) || {};
    const value = this.props.createIndex.temporaryFormMap.get(TEMP_FORM_MAP_KEY.jsonMappingValue) || '';
    // 索引管理页面也是只读属性
    const isDetailPage = window.location.pathname.includes('/detail');
    const loading = this.props.createIndex.loadingMap['mapping-loading'];

    return (
      <Spin spinning={loading}>
        { !isDetailPage && <XFormComponent
          wrappedComponentRef={(formRef) => this.$formRef = formRef}
          formData={formData}
          formMap={this.getFormMap()}
          formLayout={
            {
              labelCol: { span: 8 },
              wrapperCol: { span: 14 },
            }
          }
          layout="inline"
        />}
        <div style={{ height: this.selfAdaption + 'px' }} className={isDetailPage ? 'json-editor-wrapper detail' : 'json-editor-wrapper'}>
          <div className="tip">
            {
              this.props.isShowPlaceholder ? 
                <Tooltip title={<pre>{placeholder}</pre>}><a>查看填写示例</a></Tooltip>
                : ""
            }
          </div>
          {!loading && <EditorCom
            options={{
              language: 'json',
              value,
              theme: 'vs',
              automaticLayout: true,
              readOnly: isDetailPage,
            }}
            customMount={this.customMount}
          />}
        </div>
      </Spin>
    );
  }
}