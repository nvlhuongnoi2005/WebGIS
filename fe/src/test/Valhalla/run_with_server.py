#!/usr/bin/env python3
import argparse
import multiprocessing
import requests
import json
import os
from pathlib import Path
import shutil
import datetime
import time

# generator for post bodies from the file
def get_post_bodies(filename, expansion=False):
  with open(filename, 'r') as f:
    line_number = 0
    for line in f:
      line_number += 1
      line = line[line.find('{'):]
      line = line[0:line.rfind('}') + 1]
      post_body = json.loads(line)
      post_body['id'] = str(line_number)
      if expansion:
        post_body['action'] = 'route'
      yield post_body

def initialize(args_,response_count_):
  # for persistent connections
  global session
  session = requests.Session()
  # so each process knows the options provided
  global args
  args = args_
  # so each process can signal completing a request
  global response_count
  response_count = response_count_

# post a request
def make_request(post_body):
  # make request
  started = time.time()
  elapsed = 0
  status_code = ''
  error = ''
  expanded_edges = 0
  try:
    response = session.post(args.url, json=post_body, headers=args.headers)
    elapsed = time.time() - started
    status_code = response.status_code
    response_text = response.text
    try:
      response = response.json()
    except ValueError:
      response = None
      error = 'Invalid JSON response: %s' % response_text[:300].replace('\r', ' ').replace('\n', ' ')
    if not 200 <= status_code < 300:
      error = 'HTTP %s' % status_code
      if response_text:
        error += ': %s' % response_text[:300].replace('\r', ' ').replace('\n', ' ')
    if args.expansion and isinstance(response, dict):
      expanded_edges = len(response.get('features', []))
  except Exception as e:
    error = '%s: %s' % (type(e).__name__, e)
    elapsed = time.time() - started
  finally:
    with response_count.get_lock():
      response_count.value += 1

  if args.format == 'summary':
    return {
      'request_id': post_body['id'],
      'response_time': elapsed,
      'status_code': status_code,
      'error': error,
      'success': not error,
      'expanded_edges': expanded_edges,
    }

  # nothing to write
  if args.format == 'null':
    return

  # open a file to put the result
  output_file = os.path.join(args.output_dir, post_body['id'] + '.' + ('csv' if args.format == 'csv' else 'json'))
  with open(output_file, 'w') as f:
    try:
      # raw json
      if args.format == 'raw':
          f.write('%s' % json.dumps(response, sort_keys=True, indent=2))

      # summary json
      elif args.format == 'json':
        out = {'routes':[{'legs':[]}]}
        for leg in response['trip']['legs']:
          out['routes'][-1]['legs'].append({'maneuvers':[]})
          for man in leg['maneuvers']:
            out['routes'][-1]['legs'][-1]['maneuvers'].append({'length': man['length'], 'time': man['time'], 'instruction': man['instruction']})
        out['performance'] = {'response_time': elapsed}
        f.write('%s' % json.dumps(out, sort_keys=True, indent=2))

      # csv
      else:
        f.write('length (meters), time (seconds), instruction' + os.linesep)
        for leg in response['trip']['legs']:
          for man in leg['maneuvers']:
            f.write('%d,%d,%s%s' % (man['length']*1000, man['time'], man['instruction'], os.linesep))
     
    except Exception as e:
      f.write('%s' % e)

if __name__ == "__main__":
  # parse some program arguments
  parser = argparse.ArgumentParser()
  parser.add_argument('--test-file', type=str, help='The file with the test requests', required=True)
  parser.add_argument('--url', type=str, help='The url to which you want to POST the request bodies', default='http://localhost:8002/route')
  parser.add_argument('--output-dir', type=str, help='The directory in which to place benchmark output')
  parser.add_argument('--concurrency', type=int, help='The number of processes to use to make requests', default=multiprocessing.cpu_count())
  parser.add_argument('--format', type=str, help='Supports csv, json, raw, null and summary output formats', default='csv')
  parser.add_argument('--expansion', action='store_true',
                      help='Treat the input as route requests sent to /expansion and count expanded edges')
  parser.add_argument('--headers', type=str, help='Additional http headers to send with the requests. Follows the http header spec, eg. some-header-name: some-header-value', action='append', nargs='*', default=[])
  parsed_args = parser.parse_args()
  if parsed_args.format not in ('csv', 'json', 'raw', 'null', 'summary'):
    parser.error('--format must be csv, json, raw, null, or summary')
  if parsed_args.expansion and not parsed_args.url.rstrip('/').endswith('/expansion'):
    parser.error('--expansion requires --url to end with /expansion')

  # make the output directory
  if parsed_args.output_dir is None:
    basename = os.path.basename(os.path.splitext(parsed_args.test_file)[0])
    datestr = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    parsed_args.output_dir = '_'.join([datestr, basename])
  if os.path.exists(parsed_args.output_dir):
    shutil.rmtree(parsed_args.output_dir)
  os.makedirs(parsed_args.output_dir, exist_ok=True)

  # setup http headers
  parsed_args.headers = { k: v for k, v in [ h.split(': ') for hs in parsed_args.headers for h in hs] }
  # track progress with a count of finished requests
  response_count = multiprocessing.Value('i', 0)
  # make a worker pool to work on the requests
  work = [body for body in get_post_bodies(parsed_args.test_file, parsed_args.expansion)]
  # Note: workers also call initialize for themselves
  with multiprocessing.Pool(initializer=initialize, initargs=(parsed_args,response_count), processes=parsed_args.concurrency) as pool:
    benchmark_started = time.time()
    result = pool.map_async(make_request, work)

    # check progress
    if parsed_args.format != 'null':
      print('Placing %d results in %s' % (len(work), parsed_args.output_dir))
    progress = 0
    increment = 5
    while not result.ready():
      result.wait(timeout=5)      
      next_progress = int(response_count.value / len(work) * 100)
      if int(next_progress / increment) > progress:
        print('%d%%' % next_progress)
        progress = int(next_progress / increment)
    if progress != 100 / increment:
      print('100%')

    if parsed_args.format == 'summary':
      summary_file = Path(parsed_args.output_dir) / 'benchmark_summary.txt'
      records = result.get()
      successful = [record for record in records if record['success']]
      trace_times = [record['response_time'] for record in successful]
      request_times = [record['response_time'] for record in records]
      edge_counts = [record['expanded_edges'] for record in successful]
      total_edges = sum(edge_counts)
      total_trace_time = sum(trace_times)
      total_request_time = sum(request_times)
      benchmark_wall_time = time.time() - benchmark_started
      status_counts = {}
      error_counts = {}
      for record in records:
        status = str(record['status_code']) if record['status_code'] else 'no_response'
        status_counts[status] = status_counts.get(status, 0) + 1
        if record['error']:
          error_counts[record['error']] = error_counts.get(record['error'], 0) + 1
      error_summary = '; '.join(
        '%s (%d)' % (error, count)
        for error, count in sorted(error_counts.items(), key=lambda item: item[1], reverse=True)[:3]
      )
      summary = {
        'route_requested': len(records),
        'route_traced': len(successful),
        'route_failed': len(records) - len(successful),
        'total_trace_time_seconds': f'{total_trace_time:.6f}',
        'average_trace_time_seconds': f'{total_trace_time / len(trace_times):.6f}' if trace_times else '',
        'min_trace_time_seconds': f'{min(trace_times):.6f}' if trace_times else '',
        'max_trace_time_seconds': f'{max(trace_times):.6f}' if trace_times else '',
        'total_request_time_seconds': f'{total_request_time:.6f}',
        'average_request_time_seconds': f'{total_request_time / len(request_times):.6f}' if request_times else '',
        'min_request_time_seconds': f'{min(request_times):.6f}' if request_times else '',
        'max_request_time_seconds': f'{max(request_times):.6f}' if request_times else '',
        'benchmark_wall_time_seconds': f'{benchmark_wall_time:.6f}',
        'requests_per_second': f'{len(records) / benchmark_wall_time:.2f}' if benchmark_wall_time else '',
        'successful_requests_per_second': f'{len(successful) / benchmark_wall_time:.2f}' if benchmark_wall_time else '',
        'http_status_counts': ', '.join('%s=%d' % item for item in sorted(status_counts.items())),
        'error_summary': error_summary,
        'total_expanded_edges': total_edges if parsed_args.expansion else '',
        'average_expanded_edges': f'{total_edges / len(edge_counts):.2f}' if edge_counts else '',
      }
      with open(summary_file, 'w', newline='') as f:
        for key, value in summary.items():
          f.write(f'{key}: {value}{os.linesep}')
      print('Summary written to %s' % summary_file)

  # print total duration
  if parsed_args.format == "json":
    output_dir_path = Path(parsed_args.output_dir)
    duration = 0
    for out_f in output_dir_path.iterdir():
      if out_f.is_file() and out_f.suffix == ".json":
        with open(out_f) as f:
          try:
              duration += json.load(f)["performance"]["response_time"]
          except json.decoder.JSONDecodeError:
              continue

    print(f"Requests took {duration} seconds")
