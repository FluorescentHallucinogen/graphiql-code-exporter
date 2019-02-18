import React, {Component} from 'react';
import {Button, Icon, Tooltip} from 'antd';
import copy from 'copy-to-clipboard';
import {parse, print} from 'graphql/language';
import Prism from 'prismjs';

// TODO: can we use plain graphiql nodes or do we need @onegraph?
import GraphiQL from '@onegraph/graphiql';

// TODO: not sure if we should include all snippets by default
import defaultSnippets from './snippets';

function formatVariableName(name) {
  var uppercasePattern = /[A-Z]/g;

  return (
    name.charAt(0).toUpperCase() +
    name
      .slice(1)
      .replace(uppercasePattern, '_$&')
      .toUpperCase()
  );
}

const getInitialOptions = snippet =>
  snippet.options.reduce((newOptions, option) => {
    newOptions[option.id] = {
      label: option.label,
      value: option.initial,
    };

    return newOptions;
  }, {});

// TODO: filter subscriptions
const getOperations = query => {
  let operations = [];
  try {
    operations = parse(query).definitions;
  } catch (e) {}

  return operations;
};

const getUsedVariables = (variables, operation) => {
  return operation.variableDefinitions.reduce((usedVariables, variable) => {
    const variableName = variable.variable.name.value;
    if (variables[variableName]) {
      usedVariables[variableName] = variables[variableName];
    }

    return usedVariables;
  }, {});
};

const getOperationName = operation =>
  operation.name ? operation.name.value : operation.operation;

const getOperationDisplayName = operation =>
  operation.name
    ? operation.name.value
    : '<Unnamed:' + operation.operation + '>';

class CodeExporter extends Component {
  constructor(props, context) {
    super(props, context);

    const {initialSnippet, snippets} = props;

    if (!snippets || snippets.length === 0) {
      // TODO: throw
      return false;
    }

    const snippet = initialSnippet || snippets[0];

    this.state = {
      languages: [],
      showCopiedTooltip: false,
      options: getInitialOptions(snippet),
      snippet,
      query: props.query,
    };
  }

  componentDidMount() {
    const style = document.createElement('link');
    style.setAttribute('rel', 'stylesheet');
    style.setAttribute(
      'href',
      'https://cdnjs.cloudflare.com/ajax/libs/prism/1.15.0/themes/' +
        this.props.theme +
        '.min.css',
    );

    document.head.appendChild(style);
    this.style = style;

    const langs = this.props.snippets.map(
      snippet => snippet.prismLanguage || snippet.language.toLowerCase(),
    );

    langs.forEach(lang => {
      if (this.state.languages.indexOf(lang) === -1) {
        require('prismjs/components/prism-' + lang);
      }
    });

    this.setState(prevState => ({
      languages: [...prevState.languages, ...langs],
    }));
  }

  componentWillUnmount() {
    this.style.remove();
  }

  static getDerivedStateFromProps(props, state) {
    // for now we do not support subscriptions, might add those later
    const operations = getOperations(props.query).filter(
      op => op.operation !== 'subscription',
    );

    return {
      operations,
      query: props.query,
    };
  }

  setSnippet = name => {
    const snippet = this.props.snippets.find(
      snippet =>
        snippet.name === name &&
        snippet.language === this.state.snippet.language,
    );

    this.setState({
      options: getInitialOptions(snippet),
      snippet,
    });
  };

  setLanguage = language => {
    const snippet = this.props.snippets.find(
      snippet => snippet.language === language,
    );

    this.setState({
      options: getInitialOptions(snippet),
      snippet,
    });
  };

  setOption = (id, value) =>
    this.setState({
      options: {
        ...this.state.options,
        [id]: {
          ...this.state.options[id],
          value: value,
        },
      },
    });

  render() {
    const {
      serverUrl,
      snippets,
      context = {},
      variables = {},
      headers = {},
    } = this.props;
    const {snippet, options, operations, showCopiedTooltip} = this.state;

    if (!operations || operations.length === 0 || !snippet) {
      return null;
    }

    const {name, language, prismLanguage, generate} = snippet;

    const operationList = operations.map(operation => ({
      query: print(operation),
      name: getOperationName(operation),
      displayName: getOperationDisplayName(operation),
      type: operation.operation,
      variableName: formatVariableName(getOperationName(operation)),
      variables: getUsedVariables(variables, operation),
      operation,
    }));

    let codeSnippet = generate({
      serverUrl,
      headers,
      context,
      operations: operationList,
      options: Object.keys(options).reduce((flags, id) => {
        flags[id] = options[id].value;
        return flags;
      }, {}),
    });

    const rawSnippet = codeSnippet;
    // we use a try catch here because otherwise highlight might break the render
    try {
      const lang = prismLanguage || language.toLowerCase();
      codeSnippet = Prism.highlight(codeSnippet, Prism.languages[lang], lang);
    } catch (e) {}

    return (
      <div style={{minWidth: 410}}>
        <div
          style={{
            fontFamily:
              'system, -apple-system, San Francisco, Helvetica Neue, arial, sans-serif',
          }}>
          <div style={{padding: '12px 7px 8px'}}>
            <GraphiQL.Menu label={language} title="Language">
              {snippets
                .map(snippet => snippet.language)
                .filter((lang, index, arr) => arr.indexOf(lang) === index)
                .sort((a, b) => a > b || -1)
                .map(lang => (
                  <li onClick={() => this.setLanguage(lang)}>{lang}</li>
                ))}
            </GraphiQL.Menu>
            <GraphiQL.Menu label={name} title="Mode">
              {snippets
                .filter(snippet => snippet.language === language)
                .map(snippet => snippet.name)
                .sort((a, b) => a.toLowerCase() > b.toLowerCase() || -1)
                .map(snippetName => (
                  <li onClick={() => this.setSnippet(snippetName)}>
                    {snippetName}
                  </li>
                ))}
            </GraphiQL.Menu>
          </div>
          {snippet.options.length > 0 ? (
            <div style={{padding: '0px 11px 10px'}}>
              <div
                style={{
                  fontWeight: 700,
                  color: 'rgb(177, 26, 4)',
                  fontVariant: 'small-caps',
                  textTransform: 'lowercase',
                }}>
                Options
              </div>
              {Object.keys(options)
                .sort((a, b) => a > b || -1)
                .map(optionId => (
                  <div key={optionId}>
                    <input
                      id={optionId}
                      type="checkbox"
                      style={{position: 'relative', top: -1}}
                      value={options[optionId].value}
                      onChange={() =>
                        this.setOption(optionId, !options[optionId].value)
                      }
                    />
                    <label for={optionId} style={{paddingLeft: 5}}>
                      {options[optionId].label}
                    </label>
                  </div>
                ))}
            </div>
          ) : (
            <div style={{minHeight: 8}} />
          )}
        </div>
        <Tooltip
          title="Copied!"
          visible={showCopiedTooltip}
          overlayStyle={{fontSize: 10}}>
          <Button
            style={{
              fontSize: '1.2em',
              padding: 0,
              position: 'absolute',
              left: 340,
              marginTop: -20,
              width: 40,
              height: 40,
              backgroundColor: 'white',
              borderRadius: 40,
              boxShadow: '0 0 1px black',
            }}
            type="link"
            onClick={() => {
              copy(rawSnippet);
              this.setState({showCopiedTooltip: true}, () =>
                setTimeout(
                  () => this.setState({showCopiedTooltip: false}),
                  450,
                ),
              );
            }}>
            <Icon type="copy" />
          </Button>
        </Tooltip>
        <pre
          style={{
            borderTop: '1px solid rgb(220, 220, 220)',
            padding: '15px 12px',
            margin: 0,
          }}>
          <code
            style={{
              fontFamily:
                'Dank Monk, Fira Code, Hack, Consolas, Inconsolata, Droid Sans Mono, Monaco, monospace',
              textRendering: 'optimizeLegibility',
              fontSize: 12,
            }}
            dangerouslySetInnerHTML={{
              __html: codeSnippet,
            }}
          />
          <div style={{minHeight: 10}} />
        </pre>
      </div>
    );
  }
}

// we borrow class names from graphiql's CSS as the visual appearance is the same
// yet we might want to change that at some point in order to have a self-contained standalone
export default function CodeExporterWrapper({
  query,
  serverUrl,
  variables,
  context = {},
  headers = {},
  theme = 'prism',
  hideCodeExporter = () => {},
  snippets = defaultSnippets,
}) {
  let jsonVariables = {};

  try {
    jsonVariables = JSON.parse(variables);
  } catch (e) {}

  return (
    <div
      className="historyPaneWrap"
      style={{
        width: 440,
        minWidth: 440,
        zIndex: 7,
      }}>
      <div className="history-title-bar">
        <div className="history-title">Code Exporter</div>
        <div className="doc-explorer-rhs">
          <div className="docExplorerHide" onClick={hideCodeExporter}>
            {'\u2715'}
          </div>
        </div>
      </div>
      <div
        className="history-contents"
        style={{borderTop: '1px solid #d6d6d6'}}>
        <CodeExporter
          query={query}
          serverUrl={serverUrl}
          snippets={snippets}
          theme={theme}
          context={context}
          headers={headers}
          variables={jsonVariables}
        />
      </div>
    </div>
  );
}
